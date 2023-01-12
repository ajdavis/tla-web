//
// TLA+ web explorer UI logic.
//

let tree;
let parser;
let languageName = "tlaplus";

let model = {
    specText: null,
    allInitStates: [],
    nextStatePred: null,
    currState: null,
    currNextStates: [],
    currNextStatesAlias: [],
    currTrace: [],
    currTraceAliasVals: [],
    specTreeObjs: null,
    specDefs: null,
    specConsts: null,
    specConstInputVals: {},
    specConstVals: {},
    parser: null,
    traceExprInputText: "",
    traceExprs: [],
    hiddenStateVars: [],
    // State hash that trace lasso goes back to.
    lassoTo: null,
    errorObj: null
}

// The main app component.
let App;

// Parse URL params;
const urlSearchParams = new URLSearchParams(window.location.search);
const urlParams = Object.fromEntries(urlSearchParams.entries());
let enableEvalTracing = parseInt(urlParams["debug"]);


function displayStateGraph() {
    // TODO: Will need to flesh out this functionality further.

    let stategraphDiv = document.getElementById('stategraph');
    stategraphDiv.hidden = false;

    var cy = cytoscape({
        container: document.getElementById('stategraph'), // container to render in
        style: [
            {
                selector: 'node',
                style: {
                    'label': function (el) {
                        return JSON.stringify(el.data()["state"]);
                    },
                    "background-color": "lightgray",
                    "border-style": "solid",
                    "border-width": "1",
                    "border-color": "black"
                }
            },
        ]
    });

    let reachable = computeReachableStates(specTreeObjs, specConstVals);
    let edges = reachable["edges"];
    console.log(reachable["edges"]);
    console.log(reachable);

    for (const state of reachable["states"]) {
        dataVal = { id: hashSum(state), state: state };
        console.log(dataVal);
        cy.add({
            group: 'nodes',
            data: dataVal,
            position: { x: 200, y: 200 }
        });
    }

    let eind = 0;
    for (const edge of edges) {
        cy.add({
            group: 'edges', data: {
                id: 'e' + eind,
                source: hashSum(edge[0]),
                target: hashSum(edge[1])
            }
        });
        eind++;
    }
    cy.edges('edge').style({
        "curve-style": "straight",
        "target-arrow-shape": "triangle"
    })
    // let layout = cy.layout({name:"cose"});
    let layout = cy.layout({ name: "breadthfirst" });
    layout.run();
}


function displayEvalGraph() {
    console.log("#displayEvalGraph");
    let stategraphDiv = document.getElementById('trace-pane');
    stategraphDiv.hidden = false;

    // cytoscape.use("dagre");

    var cy = cytoscape({
        container: document.getElementById('trace-pane'), // container to render in
        style: [
            {
                selector: 'node',
                // shape: "barrel",
                size: "auto",
                style: {
                    'label': function (el) {
                        return el.data()["expr_text"].replaceAll("\n", "");
                    },
                    // "width": function(el){
                    //     console.log(el);
                    //     return el.data().expr_text.length * 10 + 20;
                    // },
                    // "height": 15,
                    "background-color": "white",
                    "text-valign": "center",
                    // "text-halign": "center",
                    "border-style": "solid",
                    "border-width": "1",
                    "border-color": "white",
                    "font-family": "monospace",
                    "font-size": "12px",
                    "shape": "rectangle"
                }
            },
        ]
    });

    let nodes = _.uniq(_.flatten(evalNodeGraph.map(d => d[0])))
    for (const node of nodes) {
        cy.add({
            group: 'nodes',
            data: { id: hashSum(node), expr_text: node },
            position: { x: 200, y: 200 }
        });
    }

    let eind = 0;
    for (const edgeData of evalNodeGraph) {
        let edge = edgeData[0];
        let retVal = edgeData[1];
        cy.add({
            group: 'edges', data: {
                id: 'e' + eind,
                source: hashSum(edge[0]),
                target: hashSum(edge[1]),
                label: retVal[0]["val"].toString()
            }
        });
        eind++;
    }
    cy.edges('edge').style({
        "curve-style": "straight",
        "target-arrow-shape": "triangle",
        "font-family": "monospace",
        "font-size": "10px",
        "color": "blue",
        "width": 2,
        "label": function (el) {
            return el.data().label;
        }
    })
    // let layout = cy.layout({name:"cose"});
    // let layout = cy.layout({ name: "breadthfirst" });
    let layout = cy.layout({ name: "dagre", nodeDimensionsIncludeLabels: true });
    // let layout = cy.layout({ name: "elk" });
    cy.resize();
    layout.run();
}

// TODO: Implement this properly.
function toggleSpec() {
    let pane = document.getElementById("code-input-pane");
    pane.style.width = "0%";
}

function componentChooseConstants() {
    // If there are CONSTANT declarations in the spec, we must
    // instantiate them with some concrete values.
    if (_.isEmpty(model.specConsts)) {
        return m("span", {}, "");
    }
    console.log("Instantiating spec constants.");

    let chooseConstsElems = [];
    for (const constDecl in model.specConsts) {
        console.log(constDecl);
        let newDiv = m("div", {}, [
            m("span", {}, m.trust("CONSTANT " + constDecl + " &#8592; ")),
            m("input", {
                class: "const-input",
                id: `const-val-input-${constDecl}`,
                oninput: (e) => model.specConstInputVals[constDecl] = e.target.value,
                value: model.specConstInputVals[constDecl]
            })
        ])
        chooseConstsElems.push(newDiv);
    }

    let setButtonDiv = m("div", { id: "set-constants-button", class: "button-base", onclick: setConstantValues }, "Set constant values")

    return m("div", {}, [
        m("div", { class: "pane-title" }, "Choose constants"),
        m("div", { id: "choose-constants-elems" }, chooseConstsElems),
        setButtonDiv,
    ]);
}

function componentNextStateChoiceElement(state, ind) {
    let hash = hashSum(state);

    let varNames = _.keys(state.getStateObj());
    let stateVarElems = varNames.map((varname, idx) => {
        let cols = [
            m("td", { class: "state-varname" }, varname),
            m("td", [tlaValView(state.getVarVal(varname))]),
            m("td", { style: "width:15px" }, ""), // placeholder row.
        ]

        return m("tr", { style: "border-bottom: solid" }, cols);
    });

    let opac = model.lassoTo === null ? "100" : "50";
    let nextStateElem = m("div", {
        class: "init-state",
        style: `opacity: ${opac}%`,
        onclick: () => chooseNextState(hash)
    }, stateVarElems);
    return nextStateElem;
}

function componentErrorInfo() {
    let errorInfo = m("div", {
        class: "error-info",
        hidden: model.errorObj === null
    }, model.errorObj === null ? "" : model.errorObj.message + " (" + model.errorObj.errorPos + ")");
    return errorInfo;
}

function componentNextStateChoices(nextStates) {
    nextStates = model.currNextStates;

    let nextStateElems = [];

    nextStateElems.push(componentErrorInfo());

    if (model.lassoTo !== null) {
        // If we're stuck in a lasso, don't permit any further next state choices.
        return [];
    }

    for (var i = 0; i < nextStates.length; i++) {
        var state = nextStates[i];
        let nextStateElem = componentNextStateChoiceElement(state, i);
        nextStateElems.push(nextStateElem);
    }
    // console.log("next state elems:", nextStateElems);
    return nextStateElems;
}

// Step back one state in the current trace.
function traceStepBack() {
    // Clear out a lasso condition in this case.
    if (model.lassoTo !== null) {
        model.lassoTo = null;
        return;
    }
    model.currTrace = model.currTrace.slice(0, model.currTrace.length - 1);
    updateTraceRouteParams();

    // Back to initial states.
    if (model.currTrace.length === 0) {
        console.log("Back to initial states.")
        reloadSpec();
        return;
    } else {
        console.log("stepping back");
        let lastState = model.currTrace[model.currTrace.length - 1];
        let interp = new TlaInterpreter();
        let nextStates = interp.computeNextStates(model.specTreeObjs, model.specConstVals, [_.cloneDeep(lastState)])
            .map(c => c["state"].deprimeVars());
        model.currNextStates = _.cloneDeep(nextStates);
    }
}

// Updates the current URL route to store the current trace.
function updateTraceRouteParams() {
    let traceHashed = model.currTrace.map(s => hashSum(s));
    let oldParams = m.route.param();
    if (traceHashed.length === 0) {
        delete oldParams.trace;
    }
    let traceParamObj = traceHashed.length > 0 ? { trace: traceHashed.join(",") } : {}
    let newParams = Object.assign(oldParams, traceParamObj);
    m.route.set("/home", newParams);
}

function chooseNextState(statehash_short) {
    // console.log("currNextStates:", JSON.stringify(currNextStates));
    console.log("chooseNextState: ", statehash_short);
    let nextStateChoices = model.currNextStates.filter(s => hashSum(s) === statehash_short);
    if (nextStateChoices.length === 0) {
        throw Error("Given state hash does not exist among possible next states.")
    }
    let nextState = nextStateChoices[0];

    // If the next state already exists in the current trace, then treat it as a
    // "lasso" transition, and freeze the trace from continuing.
    if (model.currTrace.map(s => hashSum(s)).includes(statehash_short)) {
        console.log("Reached LASSO!");
        model.lassoTo = statehash_short;
        return;
    }

    console.log("nextState:", JSON.stringify(nextState));
    console.log("nextStatePred:", model.nextStatePred);

    // Append next state to the trace and update current route.
    model.currTrace.push(nextState);
    updateTraceRouteParams();

    const start = performance.now();

    let interp = new TlaInterpreter();

    try {
        let nextStates = interp.computeNextStates(model.specTreeObjs, model.specConstVals, [nextState])
            .map(c => c["state"].deprimeVars());

        model.currNextStates = _.cloneDeep(nextStates);
        const duration = (performance.now() - start).toFixed(1);
        console.log(`Generation of next states took ${duration}ms`)
    } catch (e) {
        console.error("Error computing next states.");
        if (currEvalNode !== null) {
            // Display line where evaluation error occurred.
            showEvalError(currEvalNode, e);
        }
        return;
    }
}

function evalExprStrInStateContext(state, exprStr) {
    let nullTree;
    let start = performance.now();

    // Create a dummy spec to parse/evaluate the expression.
    let dummySpec = "---- MODULE dummy_eval_spec ----\n";
    dummySpec += `Expr == ${exprStr}\n`;
    dummySpec += "====";

    // const dummySpecTree = parser.parse(dummySpec, nullTree);
    let dummyTreeObjs = parseSpec(dummySpec);
    // console.log("dummy tree objs:", dummyTreeObjs);

    let evalCtx = new Context(null, state, model.specDefs, {}, model.specConstVals);
    let opDefs = dummyTreeObjs["op_defs"];
    let exprNode = opDefs["Expr"].node;
    let exprVal = evalExpr(exprNode, evalCtx)[0]["val"];

    const duration = (performance.now() - start).toFixed(1);
    // console.log("return val:", exprVal);
    console.log("compute duration val ms:", duration);
    return exprVal;
}

function setConstantValues() {
    console.log("#setConstantValues");
    let constVals = {};
    let nullTree;
    for (var constDecl in model.specConsts) {
        let constValText = model.specConstInputVals[constDecl];
        if (constValText === undefined) {
            throw "no constant value given for " + constDecl;
        }

        // let inputElem = document.getElementById("const-val-input-" + constDecl);
        // let constValText = inputElem.value;
        console.log("constDecl:", constDecl, constValText);
        constVals[constDecl] = constValText;
    }

    // Create a dummy spec to evaluate the expressions given for each CONSTANT.
    // TODO: Might be a simpler way to do this TLA+ expression evaluation.
    let dummySpec = "---- MODULE simple_lockserver_with_constants ----\n";
    for (var constDecl in model.specConsts) {
        dummySpec += `${constDecl} == ${constVals[constDecl]}\n`;
    }
    for (var constDecl in model.specConsts) {
        dummySpec += `VARIABLE var_${constDecl}\n`;
    }
    dummySpec += `Init == \n`;
    for (var constDecl in model.specConsts) {
        dummySpec += `/\\ var_${constDecl} = ${constDecl}\n`;
    }
    dummySpec += `Next == \n`;
    for (var constDecl in model.specConsts) {
        dummySpec += `/\\ var_${constDecl}' = var_${constDecl}\n`;
    }

    console.log(dummySpec);

    dummySpec += "====";

    const dummySpecTree = parser.parse(dummySpec, nullTree);
    console.log(dummySpecTree);

    let dummyTreeObjs = parseSpec(dummySpec);
    console.log(dummyTreeObjs);

    // TODO: Make sure we evaluate the expression we're assigning to a constant
    // value first.

    // Compute the single initial state.
    let interp = new TlaInterpreter();
    let dummyInitStates = interp.computeInitStates(dummyTreeObjs);
    console.log("dummy init states:", dummyInitStates);
    assert(dummyInitStates.length === 1);
    let initStateEval = dummyInitStates[0];
    let constTlaVals = {};
    for (var constDecl in model.specConsts) {
        constTlaVals[constDecl] = initStateEval.getVarVal(`var_${constDecl}`);
    }

    // TODO: Thread these assigned values through standard spec evaluation.
    console.log("constTlaVals:", constTlaVals);
    model.specConstVals = constTlaVals;

    let currParams = m.route.param();
    m.route.set("/home", Object.assign(currParams, { constants: model.specConstInputVals }));

    reloadSpec();
}

// TODO: Simple reachability benchmark that can eventually be incorporated into 
// benchmarks page.
function reachableBench() {
    let start = performance.now();
    let reachable = computeReachableStates(specTreeObjs, specConstVals)["states"];
    const duration = (performance.now() - start).toFixed(1);
    console.log(`Computed ${reachable.length} reachable states in ${duration}ms.`);
}

function showEvalError(currEvalNode, e) {
    // Display line where evaluation error occurred.
    const $codeEditor = document.querySelector('.CodeMirror');
    // console.log(currEvalNode["startPosition"]);
    // console.log(currEvalNode["endPosition"]);
    let errorLine = currEvalNode["startPosition"]["row"];
    let errorCol = currEvalNode["startPosition"]["column"];

    let ret = model.specTreeObjs["rewriter"].getOrigLocation(errorLine, errorCol);
    console.log("ERROR pos:", ret);

    model.errorObj = Object.assign(e, { errorPos: [errorLine, errorCol] });

    // $codeEditor.CodeMirror.addLineClass(errorLine, 'background', 'line-error');
    $codeEditor.CodeMirror.addLineClass(ret[0], 'background', 'line-error');
    console.log("error evaluating node: ", currEvalNode);
    console.log(e);
}

/**
 * Clear the current trace, re-parse the spec and generate initial states.
 */
function reloadSpec() {
    console.log("Clearing current trace.");
    model.currTrace = []
    model.currTraceAliasVals = []
    model.lassoTo = null;
    model.errorObj = null;

    console.log("Generating initial states.");
    let interp = new TlaInterpreter();
    // let allInitStates;
    let initStates;
    try {
        initStates = interp.computeInitStates(model.specTreeObjs, model.specConstVals);
        model.allInitStates = _.cloneDeep(initStates);
        console.log("Set initial states: ", model.allInitStates);
    } catch (e) {
        console.error(e);
        console.error("Error computing initial states.");
        if (currEvalNode !== null) {
            // Display line where evaluation error occurred.
            showEvalError(currEvalNode, e);
        }
        return;
    }

    console.log("Computed " + model.allInitStates.length + " initial states.");

    // Display states in HTML.
    // let initStatesDiv = document.getElementById("initial-states");
    // initStatesDiv.innerHTML = "";
    // renderNextStateChoices(initStates);
    // console.log("Rendered initial states");

    model.currNextStates = _.cloneDeep(initStates);

    // displayEvalGraph();

    // Check for trace to load from given link.
    // displayStateGraph();
    // m.redraw();
}

// Function for rendering a TLA+ value that appears in a state/trace, etc.
function tlaValView(tlaVal) {
    if (tlaVal instanceof FcnRcdValue) {
        let valPairs = _.zip(tlaVal.getDomain(), tlaVal.getValues());
        let borderStyle = { style: "border:solid 0.5px gray" };
        return m("table", valPairs.map(p => {
            let key = p[0];
            let val = p[1];
            return m("tr", borderStyle, [
                m("td", borderStyle, key.toString()),
                m("td", tlaValView(val)), // TODO: do we want to recursively apply?
            ]);
        }));
    }

    // Display sets as lists of their items.
    if (tlaVal instanceof SetValue) {
        if (tlaVal.getElems().length === 0) {
            return m("span", "{}"); // empty set.
        }
        let borderStyle = { style: "border:solid 0.5px gray" };

        let setElems = tlaVal.getElems().map((v, idx) => {
            pre = idx === 0 ? "{ " : "&nbsp;&nbsp;";
            suff = idx === (tlaVal.getElems().length - 1) ? " }" : ",";
            return m("tr", [
                // TODO: Recursively apply value view function?
                m("td", m.trust(pre + v.toString() + suff)),
            ]);
        });

        return m("table", setElems);
    }

    // Display tuples as lists of their items.
    if (tlaVal instanceof TupleValue) {
        if (tlaVal.getElems().length === 0) {
            return m("span", "{}"); // empty set.
        }
        let borderStyle = { style: "border:solid 0.5px gray" };

        let setElems = tlaVal.getElems().map((v, idx) => {
            pre = idx === 0 ? "<< " : "&nbsp;&nbsp;&nbsp;";
            suff = idx === (tlaVal.getElems().length - 1) ? " >>" : ",";
            return m("tr", [
                // TODO: Recursively apply value view function?
                m("td", m.trust(pre + v.toString() + suff)),
            ]);
        });

        return m("table", setElems);
    }

    return m("span", tlaVal.toString());
}


//
// Animation view logic (experimental).
//
function makeSvgAnimObj(tlaAnimElem) {
    let name = tlaAnimElem.applyArg(new StringValue("name")).getVal();
    let attrs = tlaAnimElem.applyArg(new StringValue("attrs"));
    let children = tlaAnimElem.applyArg(new StringValue("children"));
    // console.log("name:", name);
    // console.log("attrs:", attrs);
    // console.log("children:", children);
    if (children instanceof FcnRcdValue) {
        children = children.toTuple();
    }
    let childrenElems = children.getElems();

    let attrKeys = attrs.getDomain()
    let attrVals = attrs.getValues()

    let rawKeys = attrKeys.map(v => v.getVal());
    let rawVals = attrVals.map(v => v.getVal());
    let attrObj = _.fromPairs(_.zip(rawKeys, rawVals));

    return m(name, attrObj, childrenElems.map(c => makeSvgAnimObj(c)));
}

function componentTraceViewerState(state, ind, isLastState) {

    //
    // Optionally enable experimental animation feature.
    //

    let enableAnimation = false;
    let vizSvg = m("svg", { width: 0, height: 0 }, []);

    if (enableAnimation) {
        let viewNode = model.specTreeObjs["op_defs"]["View"].node;
        let initCtx = new Context(null, state, model.specDefs, {}, model.specConsts);
        console.log("view node:", viewNode);
        let ret = evalExpr(viewNode, initCtx);
        // console.log("ret", ret);
        viewVal = ret[0]["val"];
        // console.log("view:", viewVal);

        let viewSvgObj = makeSvgAnimObj(viewVal);
        vizSvg = m("svg", { width: 600, height: 300 }, [viewSvgObj]);
    }

    let varNames = _.keys(state.getStateObj());
    varNames = _.difference(varNames, model.hiddenStateVars);
    let varRows = varNames.map((varname, idx) => {
        let cols = [
            m("td", {
                class: "th-state-varname",
                onclick: (e) => {
                    model.hiddenStateVars.push(varname);
                }
            }, varname),
            m("td", [tlaValView(state.getVarVal(varname))]),
            m("td", { style: "width:15px" }, ""), // placeholder row.
        ]

        return m("tr", { style: "border-bottom: solid" }, cols);
    });

    // Trace expression values, if any are present.
    let traceExprRows = model.traceExprs.map((expr, ind) => {
        let exprVal = evalExprStrInStateContext(state, expr);
        console.log("exprVal:", exprVal);
        let cols = [
            m("td", { class: "th-state-traceexpr" }, m("span", expr)),
            m("td", { class: "td-state-traceexpr" }, [tlaValView(exprVal)]),
            // Button to delete trace expression.
            m("td", {
                class: "trace-expr-delete",
                style: "font-weight:bold;color:red;text-align:center;",
                onclick: (e) => { _.remove(model.traceExprs, v => (v === expr)) }
            }, m.trust("&#10060;")), // placeholder row.
        ]

        return m("tr", { class: "tr-state-traceexpr", style: "border-bottom: solid" }, cols);
    });

    // Evaluate the current input trace expression to dynamically display its value.
    // Use more careful error handling to ignore bogus inputs as they are input on the fly.
    if (model.traceExprInputText.length) {
        let exprVal;
        try {
            exprVal = evalExprStrInStateContext(state, model.traceExprInputText);
            console.log("exprVal:", exprVal);
        }
        catch (e) {
            // Ignore and suppress errors here since we assume bogus inputs may appear transiently.
            exprVal = null;
        }

        let displayVal = exprVal === null ? "" : tlaValView(exprVal)
        let addClass = exprVal === null ? " tr-state-traceexpr-currinput-error" : "";
        let cols = [
            m("td", { class: "th-state-traceexpr-currinput", style: "border-right:solid 1px black;" }, m("span", model.traceExprInputText)),
            m("td", { class: "td-state-traceexpr-currinput" }, [displayVal]),
            m("td", ""), // placeholder row.
        ]

        let currTraceExprRow = m("tr", { class: "tr-state-traceexpr-currinput" + addClass, style: "border-bottom: solid" }, cols);
        traceExprRows = traceExprRows.concat([currTraceExprRow]);
    }

    let stateColorBg = isLastState ? "yellow" : "none";
    let lassoToInd = (model.lassoTo !== null) ? _.findIndex(model.currTrace, s => hashSum(s) === model.lassoTo) + 1 : ""
    let lassoNote = ((model.lassoTo !== null) && isLastState) ? " (Back to State " + lassoToInd + ")" : "";
    let headerRow = [m("tr", { style: `background-color: ${stateColorBg}` }, [
        m("th", { colspan: "2" }, "State " + (ind + 1) + lassoNote),
        m("th", { colspan: "2" }, "") // filler.
    ])];
    let rows = headerRow.concat(varRows).concat(traceExprRows);

    let rowElems = m("table", { class: "trace-state-table" }, rows);

    stateVarElems = m("div", rowElems);

    let traceStateElem = m("div", { "class": "trace-state tlc-state" },
        [stateVarElems]
            .concat(vizSvg)
    );
    return traceStateElem;
}

// TODO: Flesh out trace state visualization more thoroughly.
function traceStateView(state) {
    let sobj = state.getStateObj();
    let serverProcs = sobj["semaphore"].getDomain();
    let clientProcs = sobj["clientlocks"].getDomain();
    let serverProcElems = serverProcs.map((p, i) => {
        let col = sobj["semaphore"].applyArg(p).getVal() ? "red" : "gray";
        return m("circle", { fill: col, cx: 10 + 20 * i, cy: 10, r: 5 });
    })
    let clientProcElems = clientProcs.map((p, i) => {
        return m("circle", { fill: "gray", cx: 10 + 20 * i, cy: 25, r: 5 });
    })

    return m("svg", { width: 100, height: 50 }, serverProcElems.concat(clientProcElems));
}

function componentTraceViewer() {
    // let stateInd = 0;
    let traceElems = [];
    for (var ind = 0; ind < model.currTrace.length; ind++) {
        let state = model.currTrace[ind];
        let isLastState = ind === model.currTrace.length - 1;
        let traceStateElem = componentTraceViewerState(state, ind, isLastState);
        traceElems.push(traceStateElem);
    }

    return m("div", { id: "trace" }, traceElems);
}

async function handleCodeChange(editor, changes) {
    console.log("handle code change");

    // Enable resizable panes (experimental).
    // $( "#initial-states" ).resizable({handles:"s"});

    $("#code-input-pane").resizable({
        handles: "e",
        // alsoResize: "#trace-pane",
        // handles: {"e": ".splitter"},
        // handleSelector: ".splitter",
        resizeHeight: false,
    });

    // $( "#trace-pane" ).resizable({
    // handles:"w"
    // });

    // Remove any existing line error highlights.
    var nlines = codeEditor.lineCount();
    for (var i = 0; i < nlines; i++) {
        codeEditor.removeLineClass(i, "background");
    }

    const newText = codeEditor.getValue() + '\n';
    const edits = tree && changes && changes.map(treeEditForEditorChange);

    const start = performance.now();
    if (edits) {
        for (const edit of edits) {
            tree.edit(edit);
        }
    }

    let parsedSpecTree;
    parsedSpecTree = parseSpec(newText);

    model.specText = newText;
    model.specTreeObjs = parsedSpecTree;
    model.errorObj = null;

    model.specConsts = model.specTreeObjs["const_decls"];
    model.specDefs = model.specTreeObjs["op_defs"];
    model.nextStatePred = model.specTreeObjs["op_defs"]["Next"]["node"];
    model.specAlias = model.specTreeObjs["op_defs"]["Alias"];

    // Don't try to reload the spec yet if we have to instantiate constants.
    if (!_.isEmpty(model.specConsts)) {
        return;
    }

    const duration = (performance.now() - start).toFixed(1);

    reloadSpec();
}

function resetTrace() {
    reloadSpec();
    updateTraceRouteParams();
}

function componentButtonsContainer() {
    return [m("div", { id: "trace-buttons" }, [
        m("div", { class: "button-base trace-button", id: "trace-back-button", onclick: traceStepBack }, "Back"),
        m("div", { class: "button-base trace-button", id: "trace-reset-button", onclick: resetTrace }, "Reset"),
        m("div", { class: "button-base trace-button", id: "trace-reset-button", onclick: () => addTraceExpr(model.traceExprInputText) }, "Add Trace Expression"),
        m("input", {
            class: "",
            style: "font-family:monospace;width:200px;padding-left:5px;",
            id: "trace-expr-input",
            placeholder: "Enter TLA+ expression.",
            value: model.traceExprInputText,
            oninput: e => { model.traceExprInputText = e.target.value }
        }),
        // m("br"),
        // m("div", {}, model.hiddenStateVars.map(v => m("div", v)))
    ])];
}

function componentHiddenStateVars() {
    let titleElem = m("span", { style: "font-weight:bold" }, model.hiddenStateVars.length === 0 ? "" : "Hidden variables:")
    let hiddenStateVarElems = model.hiddenStateVars.map(vname => {
        return m("span", {
            class: "hidden-state-var",
            style: "padding-left:3px;",
            onclick: () => _.remove(model.hiddenStateVars, (x) => x === vname)
        }, vname)
    })
    return m("div", { id: "hidden-state-vars" }, [titleElem].concat(hiddenStateVarElems))
}

function componentTracePane() {
    return m("div", { id: "trace-pane" }, [
        m("div", { id: "choose-constants-container" }, componentChooseConstants()),
        m("div", { id: "poss-next-states-title", class: "pane-title" }, (model.currTrace.length > 0) ? "Choose Next State" : "Choose Initial State"),
        m("div", { id: "initial-states", class: "tlc-state" }, componentNextStateChoices()),
        m("div", { id: "trace-container" }, [
            m("div", { class: "pane-heading", id: "trace-state-heading" }, [
                m("div", { class: "pane-title" }, "Current Trace"),
                componentButtonsContainer(),
                componentHiddenStateVars()
            ]),
            componentTraceViewer()
        ])
    ])
}

async function loadApp() {

    // Download example spec.
    // let specPath = "./specs/simple1.tla";
    // let specPath = "./specs/simple2.tla";
    // let specPath = "./specs/lockserver.tla";
    // let specPath = "./specs/LamportMutex.tla";
    // let specPath = "./specs/lockserver_nodefs.tla";
    // let specPath = "./specs/lockserver_nodefs_anim.tla";
    // let specPath = "./specs/MongoLoglessDynamicRaft.tla";
    let specPath = "./specs/Paxos.tla";
    // let specPath = "./specs/simple_test.tla";
    // let specPath = "./specs/simple_lockserver.tla";


    //
    // Mithril app setup.
    //
    var root = document.body

    function addTraceExpr(newTraceExpr) {
        // TODO: Also check for evaluation errors.
        if (newTraceExpr.length) {
            model.traceExprs.push(newTraceExpr);
        }
    }


    App = {
        count: 1,
        oninit: function () {
            // let constantParams = m.route.param("constants");
            // if(constantParams){
            //     console.log("CONSTNS:", constantParams);
            //     model.specConstInputVals = constantParams;
            //     setConstantValues();
            // }
        },
        onupdate: function () {
            // Keep trace viewer scrolled to bottom.
            let trace = document.getElementById("trace");
            trace.scrollTo(0, trace.scrollHeight);
        },
        view: function () {
            return [
                m("div", { class: "panel-container" }, [
                    // TLA+ code pane.
                    m("div", { id: "code-input-pane" }, [
                        m("div", { id: "code-container" }, [
                            m("textarea", { id: "code-input" })
                        ])
                    ]),

                    // Splitter 
                    // TODO: Get this working.
                    // m("div", {class: "splitter"}),

                    // Display pane.
                    componentTracePane()
                ])];
        }
    }

    EvalDebugGraph = {
        count: 1,
        oncreate: function () {
            // displayEvalGraph();
        },
        onupdate: function () {
            // Keep trace viewer scrolled to bottom.
            displayEvalGraph();
        },
        view: function () {
            return [
                // TLA+ code pane.
                m("div", { id: "code-input-pane" }, [
                    m("div", { id: "code-container" }, [
                        m("textarea", { id: "code-input" })
                    ])
                ]),

                // Eval graph pane.
                m("div", { id: "trace-pane" }, [
                    m("h1", "eval graph"),
                    m("div", { id: "eval-graph" })
                ])
            ];
        }
    }

    // m.mount(root, App)
    m.route(root, "/home",
        {
            "/home": App,
            "/eval_debug_graph": EvalDebugGraph,
        });


    // Check for given spec in URL args.
    specPathArg = m.route.param("specpath");
    console.log("specpatharg", specPathArg);
    // specPathArg = urlParams["specpath"];

    // Load given spec.
    if (specPathArg !== undefined) {
        specPath = specPathArg;
    }

    const codeInput = document.getElementById('code-input');
    codeEditor = CodeMirror.fromTextArea(codeInput, {
        lineNumbers: true,
        showCursorWhenSelecting: true,
        // TODO: Work out tlaplus mode functionality for syntax highlighting.
        // mode:"tlaplus"
    });


    // Download the specified spec and load it in the editor pane.
    m.request(specPath, { responseType: "text" }).then(function (data) {
        const $codeEditor = document.querySelector('.CodeMirror');
        spec = data;
        model.specText = spec;
        console.log("Retrieved spec:", specPath);
        if ($codeEditor) {
            $codeEditor.CodeMirror.setSize("100%", "100%");
            $codeEditor.CodeMirror.on("changes", () => {
                // CodeMirror listeners are not known to Mithril, so trigger an explicit redraw after
                // processing the code change.
                handleCodeChange();
                m.redraw();

                // Load constants if given.
                let constantParams = m.route.param("constants");
                if (constantParams) {
                    console.log("CONSTNS:", constantParams);
                    model.specConstInputVals = constantParams;
                    setConstantValues();
                }

                // Load trace if given.
                let traceParamStr = m.route.param("trace")
                if (traceParamStr) {
                    traceParams = traceParamStr.split(",");
                    for (const stateHash of traceParams) {
                        chooseNextState(stateHash);
                    }
                }
            });
            $codeEditor.CodeMirror.setValue(spec);
        }
    });
}

/**
 * Main UI initialization logic. 
 */
async function init() {
    const codeInput = document.getElementById('code-input');

    await TreeSitter.init();
    parser = new TreeSitter();

    let tree = null;
    var ASSIGN_PRIMED = false;

    let codeEditor = CodeMirror.fromTextArea(codeInput, {
        lineNumbers: true,
        showCursorWhenSelecting: true,
        // TODO: Work out tlaplus mode functionality for syntax highlighting.
        // mode:"tlaplus"
    });

    codeEditor.on('changes', handleCodeChange);

    // Load the tree-sitter TLA+ parser.
    let language;
    const url = `${LANGUAGE_BASE_URL}/tree-sitter-${languageName}.wasm`;
    try {
        language = await TreeSitter.Language.load(url);
    } catch (e) {
        console.error(e);
        return;
    }

    tree = null;
    parser.setLanguage(language);

    await loadApp()
}

//
// Initialize the UI.
//
init();
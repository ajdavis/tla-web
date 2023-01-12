/**
 * 
 * TLA+ interpreter. 
 * 
 * Contains logic for expression evaluation and initial/next state generation.
 * 
 */

// For debugging.
let depth = 0;

// Simple assertion utility.
function assert(condition, message) {
    if (!condition) {
        console.error("assertion failed");
        if (message) {
            console.error(message);
        }
        throw new Error(message || 'Assertion failed');
    }
}
function evalLog(...msgArgs) {
    if (enableEvalTracing) {
        let indent = "(L" + depth + ")" + ("|".repeat(depth * 2));
        let args = [indent].concat(msgArgs)
        console.log(...args);
    }
}

function cartesianProductOf() {
    return _.reduce(arguments, function (a, b) {
        return _.flatten(_.map(a, function (x) {
            return _.map(b, function (y) {
                return x.concat([y]);
            });
        }), true);
    }, [[]]);
}

function subsets(vals) {
    const powerset = [];
    generatePowerset([], 0);

    function generatePowerset(path, index) {
        powerset.push(path);
        for (let i = index; i < vals.length; i++) {
            generatePowerset([...path, vals[i]], i + 1);
        }
    }

    return powerset;
}

// Combinations with replacement.
// See: https://stackoverflow.com/questions/32543936/combination-with-repetition
function combinations(arr, l) {
    if (l === void 0) l = arr.length; // Length of the combinations
    var data = Array(l),             // Used to store state
        results = [];                // Array of results
    (function f(pos, start) {        // Recursive function
        if (pos === l) {                // End reached
            results.push(data.slice());  // Add a copy of data to results
            return;
        }
        for (var i = start; i < arr.length; ++i) {
            data[pos] = arr[i];          // Update data
            f(pos + 1, i);                 // Call f recursively
        }
    })(0, 0);                        // Start at index 0
    return results;                  // Return results
}

function hashState(stateObj) {
    return hashSum(stateObj);
}

//
//
// TLA+ Value type definitions.
//
//

class TLAValue {
    constructor() {
    }

    toJSONITF() {
        return "'toJSONITF' unimplemented";
    }

    fingerprint() {
        return "no_fingerprint";
    }

    /**
     * Check if this value is equal to the value 'other'.
     * @param {TLAValue} other 
     */
    equals(other) {
        throw new Exception("equality check unimplemented!");
    }

    /**
     * Convert value to tuple, if possible.
     */
    toTuple() {
        console.error("toTuple: value cannot be converted to tuple");
        throw "value cannot be converted to tuple";
    }
}

class IntValue extends TLAValue {
    constructor(n) {
        super(n);
        this.val = n;
    }
    toString() {
        return this.val.toString();
    }
    toJSON() {
        return this.val;
    }
    toJSONITF() {
        return { "#type": "int", "#value": this.val };
    }
    getVal() {
        return this.val;
    }
    plus(other) {
        assert(other instanceof IntValue);
        return new IntValue(this.val + other.getVal())
    }
    minus(other) {
        assert(other instanceof IntValue);
        return new IntValue(this.val - other.getVal())
    }
    fingerprint() {
        return hashSum(this.val);
    }
    equals(other) {
        if (!other instanceof IntValue) {
            return false;
        } else {
            return this.val === other.getVal();
        }
    }
}

class BoolValue extends TLAValue {
    constructor(n) {
        super(n);
        this.val = n;
    }
    toString() {
        return this.val ? "TRUE" : "FALSE";
    }
    toJSON() {
        return this.val;
    }
    toJSONITF() {
        return { "#type": "bool", "#value": this.val };
    }
    fingerprint() {
        return hashSum(this.val);
    }
    getVal() {
        return this.val;
    }
    and(other) {
        return new BoolValue(this.getVal() && other.getVal());
    }
}

class StringValue extends TLAValue {
    constructor(s) {
        super(s);
        this.val = s;
    }
    getVal() {
        return this.val;
    }
    toString() {
        return "\"" + this.val + "\"";
    }
    toJSON() {
        return this.val;
    }
    toJSONITF() {
        return { "#type": "string", "#value": this.val };
    }
    fingerprint() {
        return this.val;
    }
}

class SetValue extends TLAValue {
    constructor(elems) {
        super(elems);
        // Remove duplicates at construction.
        this.elems = _.uniqBy(elems, (e) => e.fingerprint());
    }
    toString() {
        return "{" + this.elems.map(x => x.toString()).join(",") + "}";
    }

    toJSON() {
        return this.elems;
    }

    toJSONITF() {
        // Do a crude normalization by sorting by stringified version of each value
        // TODO: Eventually will need a more principled way to do normalization
        // and/or equality checking.
        return {
            "#type": "set",
            "#value": _.sortBy(this.elems, (e) => e.toString()).map(el => el.toJSONITF())
        };
    }

    getElems() {
        return this.elems;
    }

    size() {
        // TODO: Need to consider duplicates. Will likely require better equality handling for all types.
        return this.elems.length;
    }

    unionWith(otherSet) {
        return new SetValue(_.uniqWith(this.elems.concat(otherSet.getElems()), _.isEqual));
    }

    intersectionWith(otherSet) {
        return new SetValue(_.intersectionWith(this.elems, otherSet.getElems(), _.isEqual));
    }

    diffWith(otherSet) {
        return new SetValue(_.differenceWith(this.elems, otherSet.getElems(), _.isEqual));
    }
    fingerprint() {
        return hashSum(this.elems.map(e => e.fingerprint()).sort());
    }
}

class TupleValue extends TLAValue {
    constructor(elems) {
        super(elems);
        this.elems = elems;
    }
    toString() {
        return "<<" + this.elems.map(x => x.toString()).join(",") + ">>";
    }

    toJSON() {
        return this.elems;
    }

    append(el) {
        return new TupleValue(this.elems.concat([el]));
    }

    concatTup(tup) {
        return new TupleValue(this.elems.concat(tup.getElems()));
    }

    head() {
        if (this.elems.length === 0) {
            throw new Exception("Tried to get head of empty list");
        }
        return this.elems[0];
    }

    tail() {
        if (this.elems.length === 0) {
            throw new Exception("Tried to get tail of empty list");
        }
        return new TupleValue(this.elems.slice(1));
    }

    getElems() {
        return this.elems;
    }
    toJSONITF() {
        return { "#type": "tup", "#value": this.elems.map(el => el.toJSONITF()) };
    }
    fingerprint() {
        let rcd = this.toFcnRcd();
        return rcd.fingerprint();
    }

    /**
     * Return this tuple as an equivalent function value.
     */
    toFcnRcd() {
        // Tuples are functions with contiguous natural number domains.
        let domainVals = _.range(1, this.elems.length + 1).map(v => new IntValue(v));
        return new FcnRcdValue(domainVals, this.elems);
    }

    length() {
        return this.elems.length;
    }

    toTuple() {
        return this;
    }
}

class FcnRcdValue extends TLAValue {
    constructor(domain, values, isRecord) {
        super(domain, values);
        this.domain = domain;
        this.values = values
        // Trace 'record' types explicitly.
        this.isRecord = isRecord || false;
    }
    toString() {
        if (this.isRecord) {
            return "[" + this.domain.map((dv, idx) => dv.getVal() + " |-> " + this.values[idx]).join(", ") + "]";
        } else {
            return "(" + this.domain.map((dv, idx) => dv.toString() + " :> " + this.values[idx]).join(" @@ ") + ")";
        }
    }

    toJSON() {
        return _.fromPairs(_.zip(this.domain, this.values))
    }

    getDomain() {
        return this.domain;
    }

    getValues() {
        return this.values;
    }

    // Get index of function argument in the function's domain.
    argIndex(arg) {
        return _.findIndex(this.domain, (v) => {
            return v.fingerprint() === arg.fingerprint();
        });
    }

    /**
     * Apply the function to the argument 'arg'.
     */
    applyArg(arg) {
        let idx = this.argIndex(arg);
        assert(idx >= 0, "argument " + arg + " doesn't exist in function domain.");
        return this.values[idx];
    }

    /**
     * Apply the function to the path argument 'arg', given as array of args e.g. ["x", "y"].
     */
    applyPathArg(pathArg) {
        if (pathArg.length === 1) {
            return this.applyArg(pathArg[0]);
        }
        // Apply head of the path arg.
        let fApplied = this.applyArg(pathArg[0])
        // Apply rest of the path arg.
        return fApplied.applyPathArg(pathArg.slice(1));

        // let idx = this.argIndex(pathArg[0]);
        // assert(idx >= 0, "argument " + arg + " doesn't exist in function domain.");
        // return this.values[idx].applyPathArg(pathArg.slice(1));
    }


    updateWith(arg, newVal) {
        let idx = this.argIndex(arg);
        let newFn = _.cloneDeep(this);
        newFn.values[idx] = newVal;
        return newFn;
    }
    // Update a record value given a key sequence, representing a nested update.
    // e.g. given ["x", "y", "z"], we make the update rcd["x"]["y"]["z"] := newVal.
    updateWithPath(args, newVal) {
        evalLog("updateWithPath args:", args);
        evalLog("updateWithPath obj:", this);

        // Base case, when the update is non-nested.
        if (args.length === 1) {
            evalLog("Hit non-nested update", args);
            let idx = this.argIndex(args[0]);
            assert(idx >= 0, "arg index wasn't found for argument " + args[0]);
            let newFn = _.cloneDeep(this);
            evalLog("newVal", newVal);
            newFn.values[idx] = newVal;
            return newFn;
        }

        // Otherwise, recursively update.
        let idx = this.argIndex(args[0]);
        let newFn = _.cloneDeep(this);
        evalLog("newFn", newFn);
        newFn.values[idx] = newFn.values[idx].updateWithPath(args.slice(1), newVal);
        return newFn;
    }

    /**
     * Compose this function with the given function value and return the result.
     * @param {FcnRcdValue} other 
     */
    compose(other) {
        assert(other instanceof FcnRcdValue);

        // [x \in (DOMAIN f) \cup (DOMAIN g) |-> IF x \in DOMAIN f THEN f[x] ELSE g[x]]

        // Construct the new domain.
        // Take the union of the two domains, based on fingerprint equality.
        let thisDomainFps = this.domain.map(x => x.fingerprint());
        let newDomain = _.cloneDeep(this.domain);
        for (const v of other.getDomain()) {
            if (!thisDomainFps.includes(v.fingerprint())) {
                newDomain.push(v);
            }
        }

        evalLog("new domain:", newDomain);

        let newRange = [];
        // Construct the new range. If a domain value appeared in domains of both functions,
        // we prefer the range value of ourselves.
        for (const v of newDomain) {
            if (thisDomainFps.includes(v.fingerprint())) {
                // use our value.
                newRange.push(this.applyArg(v));
            } else {
                // use the other value.
                newRange.push(other.applyArg(v));
            }
        }

        return new FcnRcdValue(newDomain, newRange);
    }

    toJSONITF() {
        if (this.isRecord) {
            console.log(this.domain);
            console.log(this.values);
            // Record domains should always be over strings.
            return {
                "#type": "record",
                "#value": _.zipObject(this.domain.map(x => x.getVal()),
                    this.values.map(x => x.toJSONITF()))
            };
        } else {
            return {
                "#type": "map",
                "#value": _.zip(this.domain.map(x => x.toJSONITF()),
                    this.values.map(x => x.toJSONITF()))
            };
        }
    }
    fingerprint() {
        // Attempt normalization by sorting by fingerprints before hashing.
        let domFps = this.domain.map(v => v.fingerprint());
        let valsFp = this.values.map(v => v.fingerprint());

        let fcnPairs = _.zip(domFps, valsFp);
        let fcnPairsHashed = fcnPairs.map(hashSum);
        fcnPairsHashed.sort();
        return hashSum(fcnPairsHashed);
    }

    /**
     * Convert this function/record to a tuple, if it has a valid domain (i.e. {1,2,...,n}).
     */
    toTuple() {
        let dom = this.getDomain();
        // Domain must consist of all integral (i.e. natural numbered) values.
        if (!dom.every(v => v instanceof IntValue)) {
            throw "cannot convert record with domain '" + dom + "' to tuple";
        }
        let expectedDomain = _.range(1, dom.length + 1)
        let hasTupleDomain = _.isEqual(expectedDomain, _.sortBy(dom.map(v => v.getVal())));
        if (!hasTupleDomain) {
            throw "cannot convert record with domain '" + dom + "' to tuple";
        }
        let vals = this.getValues();
        let valsRevIndex = {};
        for (var ind = 0; ind < vals.length; ind++) {
            valsRevIndex[vals[ind]] = this.getDomain()[ind];
        }
        // Make sure the values are sorted by increasing indices.
        let sortedVals = _.sortBy(vals, v => valsRevIndex[v])
        return new TupleValue(sortedVals);
    }
}

/**
 * Represents a concrete TLA+ state i.e. a mapping from variable names to values.
 */
class TLAState {
    /**
     * Construct with a mapping from variable names to their corresponding TLAValue.
     */
    constructor(var_map) {
        this.stateVars = var_map;
    }

    hasVar(varname) {
        return this.stateVars.hasOwnProperty(varname);
    }

    /**
     * Return the assigned value for the given variable name in this state.
     */
    getVarVal(varname) {
        return this.stateVars[varname];
    }

    /**
     * Return the state as an object mapping variables to values.
     */
    getStateObj() {
        return this.stateVars;
    }

    /**
     * Returns a new copy of this state with the given variable updated to the
     * specified value.
     */
    withVarVal(varName, newVal) {
        return new TLAState(_.mapValues(this.stateVars, (val, k, obj) => {
            if (k === varName) {
                return newVal;
            } else {
                return val;
            }
        }));
    }

    /**
     * Given a state with primed and unprimed variables, remove the original
     * unprimed variables and rename the primed variables to unprimed versions. 
     */
    deprimeVars() {
        let newVars = _.pickBy(this.stateVars, (val, k, obj) => k.endsWith("'"));
        return new TLAState(_.mapKeys(newVars, (val, k, obj) => k.slice(0, k.length - 1)));
    }

    /**
     * Return an object representing this state using the Informal Trace Format
     * (ITF) serialization conventions for TLA values.
     * 
     * See https://apalache.informal.systems/docs/adr/015adr-trace.html.
     */
    toJSONITF() {
        // Sort keys for now.
        let outObj = {};
        for (var k of Object.keys(this.stateVars).sort()) {
            outObj[k] = this.stateVars[k].toJSONITF();
        }
        return outObj;
        // return _.mapValues(this.vars, (v) => v.toJSONITF());
    }

    toString() {
        let out = "";
        for (var k of Object.keys(this.stateVars).sort()) {
            out += "/\\ " + k + " = " + this.stateVars[k].toString() + "\n";
        }
        return out;
    }

    /**
     * Return a unique, string hash of this state.
     */
    fingerprint() {
        let stateKeys = Object.keys(this.stateVars).sort();
        // Construct an array that is sequence of each state varialbe name and a
        // fingerprint of its TLA value. Then we hash this array to produce the
        // fingerprint for this state.
        let valsToHash = [];
        for (var k of stateKeys) {
            valsToHash.push(k);
            valsToHash.push(this.stateVars[k].fingerprint());
        }
        return hashSum(valsToHash);
    }

    // toString(){
    //     return "[" + this.domain.map((dv,idx) => dv + " |-> " + this.values[idx]).join(", ") + "]";
    // }

    // toJSON(){
    //     return _.fromPairs(_.zip(this.domain, this.values))
    // }    
}

/**
 * Generates and performs syntactic rewrites on a TLA+ spec as part of a
 * pre-processing step before parsing and evaluation.
 */
class SyntaxRewriter {

    setInUniqueVarId = 0;
    origSpecText;
    // Map from rewritten spec back to the original.
    // maps from (line_new, col_new) to (line_old, col_old)

    constructor(origSpecText, parser) {
        this.origSpecText = origSpecText;
        this.parser = parser;
        this.sourceMapOffsets = [];
    }

    /**
     * Generate and apply syntax rewrites on the original spec text repeatedly
     * until a fixpoint is reached i.e until no more rewrite operations can be
     * generated. Returns the rewritten version of the spec.
     */
    doRewrites() {
        // Start with the original spec text.
        this.sourceMapOffsets = [];
        let specTextRewritten = this.origSpecText;
        let specTree = this.parser.parse(specTextRewritten + "\n", null);

        // Generate initial rewrite batch.
        let rewriteBatch = this.genSyntaxRewrites(specTree);

        // Apply AST rewrite batches until a fixpoint is reached.
        while (rewriteBatch.length > 0) {
            // console.log("New syntax rewrite iteration");
            // console.log("rewrite batch: ", rewriteBatch, "length: ", rewriteBatch.length);
            specTextRewritten = this.applySyntaxRewrites(specTextRewritten, rewriteBatch);
            // console.log("REWRITTEN:", specTextRewritten);
            specTree = this.parser.parse(specTextRewritten + "\n", null);
            rewriteBatch = this.genSyntaxRewrites(specTree);
        }
        console.log("REWRITTEN:", specTextRewritten);
        return specTextRewritten;
    }

    /**
     * Compute original location of given position from the rewritten spec.
     */
    getOrigLocation(line, col) {
        console.log("#getOrigLocation");
        let lineArg = line;
        let colArg = col;
        console.log("initial curr line,col:", lineArg, colArg);
        for(var f of _.reverse(this.sourceMapOffsets)){
        // for (var f of this.sourceMapOffsets) {
            console.log("smap:", f);

            let newPos = f(lineArg, colArg);
            lineArg = newPos[0];
            colArg = newPos[1];

            // let posAfter = m[0];
            // let lineAfter = posAfter[0]
            // let colAfter = posAfter[1];
            // // Inverse the diff direction as we apply the offsets.
            // let lineDiff = -m[1];
            // let colDiff = -m[2];

            // // Is the given position after the start of the rewritten portion?
            // // Otherwise no offset is required.
            // if (lineArg === lineAfter && colArg >= colAfter) {
            //     // lineArg unchanged.
            //     colArg += colDiff
            // }
            // else if (lineArg > lineAfter) {

            //     console.log("diff:", lineAfter, colDiff);
            //     if (lineArg > lineAfter) {
            //         lineArg += lineDiff;
            //         if (lineArg == lineAfter) {
            //             colArg += colDiff;
            //         }
            //     }
            // }
            console.log("curr line,col:", lineArg, colArg);
        }
        return [lineArg, colArg];
    }

    // Apply a given set of text rewrites to a given source text. Assumes the given
    // 'text' argument is a string given as a list of lines.
    applySyntaxRewrites(text, rewrites) {
        let lines = text.split("\n");
        // let sourceMapFn = (line, col) => (line, col);

        for (const rewrite of rewrites) {
            let startRow = rewrite["startPosition"]["row"];
            let startCol = rewrite["startPosition"]["column"];
            let endRow = rewrite["endPosition"]["row"];
            let endCol = rewrite["endPosition"]["column"];

            // Cut out original chunk.
            let prechunk = lines.slice(0, startRow).concat([lines[startRow].substring(0, startCol)]);
            let postchunk = [lines[endRow].substring(endCol)].concat(lines.slice(endRow + 1));

            // console.log("chunk out: ");
            // console.log(prechunk.join("\n").concat("<CHUNK>").concat(postchunk.join("\n")));
            // console.log("postchunk: ");
            // console.log(postchunk.join("\n"));

            // Delete line entirely.
            if (rewrite["deleteRow"] !== undefined) {
                lines[rewrite["deleteRow"]] = "";
                // TODO: Make this work.
                // lines = lines.filter((_, index) => index !== rewrite["deleteRow"]);
            } else {
                let lineInd = rewrite["startPosition"]["row"]
                let line = lines[lineInd];

                // < 
                //   PRECHUNK
                //    >|< 
                //  CHUNK TO REPLACE
                //    >|<
                //   POST CHUNK
                // >

                // Append the new string to the last line of the prechunk,
                // followed by the first line of the post chunk.
                prechunk[prechunk.length - 1] = prechunk[prechunk.length - 1].concat(rewrite["newStr"]).concat(postchunk[0]);
                // Then append the rest of the postchunk
                let linesUpdated = prechunk.concat(postchunk.slice(1));

                //
                // TODO: Revisit how to do source mapping here for error reporting.
                //
                
                // Everything after the changed lines must be shifted but everything before 
                // remain reamin the same.
                // let afterPos = [startRow, startCol];
                // let lineDiff = -(endRow - startRow)
                let colDiff = (rewrite["newStr"].length - prechunk.length);
                // let diff = [afterPos, lineDiff, colDiff];
                // this.sourceMapOffsets.push(diff);

                let newStartRow = startRow;
                let newStartCol = startCol;
                let newEndRow = startRow;
                let newEndCol = prechunk[prechunk.length - 1].length + rewrite["newStr"].length - 1;

                let transform = (targetRow, targetCol) => {
                    console.log("newStartRow, newEndRow", newStartRow, newEndRow);
                    console.log("start", newEndRow);
                    // if(targetRow < newStartRow){
                    //     return [targetRow, targetCol];
                    // }

                    // Target position is >= the new chunk end position.
                    if(targetRow > startRow || targetRow === newEndRow && targetCol >= newEndCol){
                        // Shift by line diff, and by column diff (if necessary).
                        // Diff from end of new chunk.
                        let lineDiff = targetRow - newEndRow;
                        let colDiff = targetRow === newEndRow ? targetCol - newEndCol : newEndCol;
                        console.log("lineDiff:", lineDiff);
                        console.log("colDiff:", colDiff);
                        // console.log("startRow:", startRow);
                        // console.log("startRow:", startRow);

                        // Transformed position is equivalent to same diff from original end position.
                        return [endRow + lineDiff, endCol + colDiff]
                    } else{
                        // No shift.
                        return [targetRow, targetCol];
                    }

                    // if(targetRow === newStartRow && targetCol == newStartCol){
                    //     return [startRow, startCol]
                    // }

                    // if(targetRow === startRow && targetCol == newEndCol){
                    //     return [endRow, endCol]
                    // }
                    // if(targetRow > startRow){
                    //     let lineDiff = endRow - startRow;
                    //     if(targetRow === end)
                    //     return [targetRow + lineDiff, endCol]
                    // }
                    // return [targetRow, targetCol];
                }

                this.sourceMapOffsets.push(transform);


                lines = linesUpdated;
            }

            // TODO: Consider removing line entirely if it is empty after rewrite.
            // if(lineNew.length > 0){
            // lines[lineInd] = lineNew;
            // } else{
            // If line is empty, remove it.
            // lines.splice(lineInd, 1);
            // }
        }
        return lines.join("\n");
    }

    /**
     * Walks a given TLA syntax tree and generates a new batch of syntactic rewrites to be
     * performed on the source module text before we do any evaluation/interpreting
     * e.g. syntactic desugaring. Should be repeatedly applied until no more rewrites are
     * produced.
     * 
     * @param {TLASyntaxTree} treeArg 
     */
    genSyntaxRewrites(treeArg) {
        // Records a set of transformations to make to the text that produced this
        // parsed syntax tree. Each rewrite is specified by a replacement rule,
        // given by a structure {startPosition: Pos, endPosition: Pos, newStr: Str}
        // where startPosition/endPosition correspond to the start and end points of
        // the source text to replace, and 'newStr' represents the string to insert
        // at this position.
        let sourceRewrites = [];

        const cursor = treeArg.walk();
        // isRendering = false;

        let currentRenderCount = 0;
        let row = '';
        let rows = [];
        let finishedRow = false;
        let visitedChildren = false;
        let indentLevel = 0;

        for (let i = 0; ; i++) {
            let displayName;
            if (cursor.nodeIsMissing) {
                displayName = `MISSING ${cursor.nodeType}`
            } else if (cursor.nodeIsNamed) {
                displayName = cursor.nodeType;
            }

            if (visitedChildren) {
                if (displayName) {
                    finishedRow = true;
                }

                if (cursor.gotoNextSibling()) {
                    visitedChildren = false;
                } else if (cursor.gotoParent()) {
                    visitedChildren = true;
                    indentLevel--;
                } else {
                    break;
                }
            } else {
                if (displayName) {
                    if (finishedRow) {
                        finishedRow = false;
                    }
                    const start = cursor.startPosition;
                    const end = cursor.endPosition;
                    const id = cursor.nodeId;
                    let fieldName = cursor.currentFieldName();
                    //   console.log(fieldName);
                    if (fieldName) {
                        fieldName += ': ';
                    } else {
                        fieldName = '';
                    }
                    let node = cursor.currentNode();

                    // Detect errors.
                    if(node.type === "ERROR"){
                        throw new Error("Parsing error.", {cause: node});
                    }

                    // Delete everything inside comments.
                    if (node.type === "block_comment") {
                        sourceRewrites.push({
                            startPosition: node.startPosition,
                            endPosition: node.endPosition,
                            newStr: ""
                        });
                        return sourceRewrites;
                    }

                    // Comments.
                    if (node.type === "comment") {
                        let rewrite = {
                            startPosition: node.startPosition,
                            endPosition: node.endPosition,
                            newStr: "",
                            // TODO: Delete line.
                            // deleteRow: node.startPosition["row"]
                        }
                        sourceRewrites.push(rewrite);
                        return sourceRewrites;
                    }

                    // Bound infix ops.
                    if (node.type === "bound_infix_op") {
                        let symbol = node.childForFieldName("symbol");
                        let rhs = node.childForFieldName("rhs");
                        // console.log("syntax rewriting:", symbol);
                        // console.log("syntax rewriting, type:", symbol.type);

                        // x \in S, x \notin S
                        if (symbol.type === "in" || symbol.type === "notin") {
                            // Rewrite '<expr> \in S' as '\E h \in S : <expr> = h'
                            // console.log("REWRITE SETIN", node);

                            let expr = node.namedChildren[0];
                            let domain = node.namedChildren[2];

                            // console.log("REWRITE SETIN expr", expr.text);
                            // console.log("REWRITE SETIN domain", domain.text);

                            // Generate a unique identifier for this new quantified variable.
                            // The hope is that it is relatively unlikely to collide with any variables in the spec.
                            // TODO: Consider how to ensure no collision here in a more principled manner.
                            let newUniqueVarId = "SETINREWRITE" + this.setInUniqueVarId;
                            this.setInUniqueVarId += 1;
                            let neg = symbol.type === "notin" ? "~" : "";
                            let outStr = `(${neg}(\\E ${newUniqueVarId} \\in ${domain.text} : ${expr.text} = ${newUniqueVarId}))`
                            let rewrite = {
                                startPosition: node.startPosition,
                                endPosition: node.endPosition,
                                newStr: outStr
                            }
                            sourceRewrites.push(rewrite);
                            return sourceRewrites;
                        }

                    }

                    if (node.type == "bounded_quantification") {
                        //
                        // In general, bounded quantifiers can look like:
                        // \E i,j \in {1,2,3}, x,y,z \in {4,5,6}, u,v \in {4,5} : <expr>
                        //
                        // Rewrite all quantifiers to a normalized form i.e.
                        // \E i1 \in S1 : \E i2 \in S2 : ... : \E in \in Sn : <expr>
                        //

                        // TODO: Make sure this works for quantifier expressions that span multiple lines.

                        let quantifier = node.childForFieldName("quantifier");
                        let quantifierBoundNodes = node.namedChildren.filter(c => c.type === "quantifier_bound");//  slice(1,node.namedChildren.length-1);
                        // let exprNode = node.childForFieldName("expression");

                        // Don't re-write if already in normalized form.
                        let isNormalized = quantifierBoundNodes.length === 1 && (quantifierBoundNodes[0].namedChildren.length === 3);
                        // console.log(node);
                        // console.log("bound nodes:", quantifierBoundNodes);
                        // console.log("REWRITE quant is normalized: ", isNormalized);

                        if (!isNormalized) {
                            // console.log("REWRITE quant:", node);
                            // console.log("REWRITE quant bound nodes:", quantifierBoundNodes);

                            // Expand each quantifier bound.
                            let quantBounds = quantifierBoundNodes.map(boundNode => {
                                let quantVars = boundNode.namedChildren.filter(c => c.type === "identifier");
                                let quantBound = boundNode.namedChildren[boundNode.namedChildren.length - 1];
                                // For \E and \A, rewrite:
                                // <Q> i,j \in S ==> <Q> i \in S : <Q> j \in S
                                // console.log(quantVars.map(c => c.text));
                                // console.log(quantVars);
                                // console.log("quantifier:",quantifier);
                                return quantVars.map(qv => [quantifier.text, qv.text, "\\in", quantBound.text].join(" ")).join(" : ");
                            })

                            let outStr = quantBounds.join(" : ");
                            // console.log("rewritten:", outStr);
                            let rewrite = {
                                startPosition: quantifier.startPosition,
                                endPosition: quantifierBoundNodes[quantifierBoundNodes.length - 1].endPosition,
                                newStr: outStr
                            }
                            sourceRewrites.push(rewrite);
                            return sourceRewrites;
                        }

                    }

                    finishedRow = true;
                }

                if (cursor.gotoFirstChild()) {
                    visitedChildren = false;
                    indentLevel++;
                } else {
                    visitedChildren = true;
                }
            }
        }
        if (finishedRow) {
            row += '</div>';
            rows.push(row);
        }

        cursor.delete();
        return sourceRewrites
    }
}

/**
 * Evaluate a TLA+ expression, given as a string, in the given context.
 */
function evalExprStrInContext(evalCtx, exprStr) {
    let nullTree;
    let start = performance.now();

    // Create a dummy spec to parse/evaluate the expression.
    let dummySpec = "---- MODULE dummy_eval_spec ----\n";
    dummySpec += `Expr == ${exprStr}\n`;
    dummySpec += "====";

    // const dummySpecTree = parser.parse(dummySpec, nullTree);
    let dummyTreeObjs = parseSpec(dummySpec);
    // console.log("dummy tree objs:", dummyTreeObjs);

    let opDefs = dummyTreeObjs["op_defs"];
    let exprNode = opDefs["Expr"].node;
    let exprVal = evalExpr(exprNode, evalCtx)[0]["val"];

    const duration = (performance.now() - start).toFixed(1);
    // console.log("return val:", exprVal);
    console.log("compute duration val ms:", duration);
    return exprVal;
}

/**
 * Parse and extract definitions and declarations from the given TLA+ module
 * text.
 */
function parseSpec(specText) {

    // Perform syntactic rewrites.
    let rewriter = new SyntaxRewriter(specText, parser);
    let specTextRewritten = rewriter.doRewrites();
    specText = specTextRewritten;

    // let orig = rewriter.getOrigLocation(7, 14);
    // console.log("ORIGLOC:", orig);

    // Now parse the rewritten spec to extract definitions, variables, etc.
    let tree = parser.parse(specText + "\n", null);
    let cursor = tree.walk();

    // One level down from the top level tree node should contain the overall TLA module.
    cursor.gotoFirstChild();
    let node = cursor.currentNode();
    assert(node.type === "module" || node.type === "extramodular_text");

    // Extramodular text is considered as comments, to be ignored.
    if (node.type === "extramodular_text") {
        console.log("ignoring extramodular_text");
        cursor.gotoNextSibling();
        node = cursor.currentNode();
        assert(node.type === "module");
    }

    op_defs = {};
    fn_defs = {};
    var_decls = {};
    const_decls = {};

    // Look for all variables and definitions defined in the module.
    let more = cursor.gotoFirstChild();
    while (more) {
        more = cursor.gotoNextSibling();
        let node = cursor.currentNode();
        // console.log(node);
        // console.log("node type:", node.type);
        // console.log("node text:", node.text);
        // console.log("node id:", node.id);


        if (node.type === "constant_declaration") {
            let constDecls = cursor.currentNode().namedChildren.filter(c => c.type !== "comment");
            for (const declNode of constDecls) {
                const_decls[declNode.text] = { "id": declNode.id };
            }
        }

        if (node.type === "variable_declaration") {
            let varDecls = cursor.currentNode().namedChildren.filter(c => c.type !== "comment");
            for (const declNode of varDecls) {
                var_decls[declNode.text] = { "id": declNode.id };
            }
        }

        if (node.type === "operator_definition") {
            // TODO: Consider iterating through 'named' children only?
            cursor.gotoFirstChild();

            // The definition identifier name.
            node = cursor.currentNode()
            console.log(node.text, node)
            // console.log(cursor.currentFieldName());
            assert(node.type === "identifier");
            let opName = node.text;

            op_defs[opName] = { "name": opName, "args": [], "node": null };

            // Skip the 'def_eq' symbol ("==").
            cursor.gotoNextSibling();
            if (!cursor.currentNode().isNamed()) {
                cursor.gotoNextSibling();
            }

            // n-ary operator. save all parameters.
            while (cursor.currentFieldName() === "parameter") {
                op_defs[opName]["args"].push(cursor.currentNode().text);
                cursor.gotoNextSibling();
                if (!cursor.currentNode().isNamed()) {
                    cursor.gotoNextSibling();
                }
            }

            // Skip any intervening comment nodes.
            cursor.gotoNextSibling();
            while (cursor.currentNode().type === "comment") {
                cursor.gotoNextSibling();
                console.log(cursor.currentNode());
                console.log(cursor.currentNode().type);
                console.log(cursor.currentFieldName());
            }

            // We should now be at the definition node.
            // console.log(cursor.currentNode().text)
            let def = cursor.currentNode();
            // console.log("def type:", def.type);
            // console.log("def type:", def);

            // console.log(cursor.currentNode());
            // let var_ident = cursor.currentNode();
            cursor.gotoParent();
            // Save the variable declaration.
            // var_decls[var_ident.text] = {"id": node.id}; 
            op_defs[opName]["node"] = def;
            // console.log("opDef:", op_defs[opName]);
        }

        // e.g. F[x,y \in {1,2}, z \in {3,4}] == x + y + z
        if (node.type === "function_definition") {
            // TODO: Consider iterating through 'named' children only?
            cursor.gotoFirstChild();
            console.log("fn def named children:", node.namedChildren);

            let fnName = node.namedChildren[0].text;
            let quant_bounds = node.namedChildren.filter(n => n.type === "quantifier_bound");
            let fnDefNode = node;

            // The definition identifier name.
            node = cursor.currentNode()
            console.log(node.text, node)
            // console.log(cursor.currentFieldName());
            // assert(node.type === "identifier");
            // let fnName = node.text;

            fn_defs[fnName] = { "name": fnName, "quant_bounds": quant_bounds, "node": null };
            cursor.gotoParent();
            // Save the function definition.
            fn_defs[fnName]["node"] = fnDefNode;
        }

    }

    console.log("module const declarations:", const_decls);
    console.log("module var declarations:", var_decls);
    console.log("module definitions:", op_defs);
    console.log("module fcn definitions:", fn_defs);

    // Try parsing out actions if possible.
    let actions = [];
    if (op_defs.hasOwnProperty("Next")) {
        let nextNode = op_defs["Next"].node;

        //
        // Syntactic Action Pattern I:
        //
        // \/ Action1
        // \/ Action2
        // \/ ...
        // \/ ActionN
        //
        console.log("NEXTNODE:", nextNode);
        console.log("NEXT_CHILDR:", nextNode.namedChildren);
        if (nextNode.type === "disj_list") {
            actions = nextNode.namedChildren.map(c => c.namedChildren[1]);
        }
        // Default: treat Next as one big action.
        else {
            actions = [nextNode];
        }
    }

    console.log("ACTIONS: ", actions);

    objs = {
        "const_decls": const_decls,
        "var_decls": var_decls,
        "op_defs": op_defs,
        "fn_defs": fn_defs,
        "actions": actions,
        "rewriter": rewriter
    }

    return objs;
}

/**
 * Defines an evaluation context structure for evaluating TLC expressions and
 * initial/next state generation.
 */
class Context {
    constructor(val, state, defns, quant_bound, constants, prev_func_val) {

        // @type: TLAValue
        // The result value of a TLA expression, or 'null' if no result has been
        // computed yet.
        this.val = val;

        // @type: TLAState
        // Represents the current assignment of values to variables in an
        // in-progress expression evaluation i.e. simply a mapping from
        // variable names to TLA values.
        this.state = state;

        // @type: Object
        // Global definitions that exist in the specification, stored as mapping
        // from definition names to their syntax tree node.
        this.defns = defns;

        // @type: Object
        // Map containing values of any instantiated constant parameters of the spec.
        this.constants = constants;

        // @type: string -> TLCValue
        // Currently bound identifiers in the in-progress expression evaluation,
        // stored as a mapping from identifier names to their TLC values.
        this.quant_bound = quant_bound;

        // @type: TLAValue
        // Stores a binding of a previous function value (e.g. the @ symbol) for 
        // EXCEPT based record updates.
        this.prev_func_val = prev_func_val;

        // Are we evaluating this expression inside a "primed" context i.e.
        // should we treat all non-constant expressions (e.g. state variables) 
        // as being primed.
        this.primed = false;
    }

    /**
     * Return a copy of this Context object.
     * 
     * Avoids copying of 'defns' since we assume they should be global
     * definitions that never change.
     */
    clone() {
        let valNew = _.cloneDeep(this.val);
        let stateNew = _.cloneDeep(this.state);
        let defnsNew = this.defns // don't copy this field.
        let quant_boundNew = _.cloneDeep(this.quant_bound);
        let constants = _.cloneDeep(this.constants);
        let prev_func_val = _.cloneDeep(this.prev_func_val);
        return new Context(valNew, stateNew, defnsNew, quant_boundNew, constants, prev_func_val);
    }

    /**
     * Returns a new copy of this context with 'val' and 'state' updated to the
     * given values.
     * 
     * Should be equivalent to calling ctx.withVal(valNew).withState(stateNew)
     * but goal is to be more efficient.
     * @param {TLCValue} valNew 
     * @param {TLAState} stateNew 
     */
    withValAndState(valNew, stateNew) {
        let ctxCopy = this.clone();
        ctxCopy["val"] = valNew;
        ctxCopy["state"] = stateNew;
        return ctxCopy;
    }


    /**
     * Returns a new copy of this context with 'val' updated to the given value.
     * @param {TLCValue} valNew 
     */
    withVal(valNew) {
        let ctxCopy = this.clone();
        ctxCopy["val"] = valNew;
        return ctxCopy;
    }

    /**
     * Returns a new copy of this context with 'state' updated to the given value.
     * @param {Object} stateNew 
     */
    withState(stateNew) {
        let ctxCopy = this.clone();
        ctxCopy["state"] = stateNew;
        return ctxCopy;
    }

    /**
     * Returns a new copy of this context with the value 'val' bound to 'name'.
     */
    withBoundVar(name, val) {
        let ctxCopy = this.clone();
        ctxCopy["quant_bound"][name] = val;
        return ctxCopy;
    }

    /**
     * Returns a new copy of this context that has been set to "primed".
     */
    withPrimed() {
        let ctxCopy = this.clone();
        ctxCopy.primed = true;
        return ctxCopy;
    }

    /**
     * Is this a "primed" evaluation context.
     */
    isPrimed() {
        return this.primed;
    }
}

function evalLnot(v, ctx) {
    evalLog("evalLnot: ", v);
    lval = evalExpr(v, ctx)[0]["val"];
    let retval = new BoolValue(!lval.getVal())
    evalLog("evalLnot retval: ", retval);
    return [ctx.withVal(retval)];
}

function evalLand(lhs, rhs, ctx) {
    assert(ctx instanceof Context);

    // Evaluate left to right.
    evalLog("## LAND - LHS:", lhs.text, ", RHS: ", rhs.text);
    let lhsEval = _.flattenDeep(evalExpr(lhs, ctx));
    evalLog("lhsEval:", lhsEval);
    let rhsEval = lhsEval.map(lctx => {
        evalLog("rhs:", rhs.text);
        evalLog("lctx:", lctx);
        return evalExpr(rhs, lctx).map(actx => {
            return [actx.withValAndState((lctx["val"].and(actx["val"])), actx["state"])];
        })
    });
    return _.flattenDeep(rhsEval);
}

// Handle a set of returned contexts from a disjunctive evaluation and determine if they should
// be coalesced into a single value or all contexts should be maintained as separate evaluation branches.
function processDisjunctiveContexts(ctx, retCtxs, currAssignedVars) {
    // Deal with return contexts for existential quantifiers.
    if (retCtxs.length > 1) {

        // If an evaluation has returned multiple contexts, it must have been the
        // result of a disjunctive split somewhere along the way, and in this case,
        // each branch must return a boolean value. (IS THIS CORRECT???)
        evalLog("disj ret vals: ", retCtxs.map(c => c["val"]));
        assert(retCtxs.map(c => c["val"]).every(v => v instanceof TLAValue));
        assert(retCtxs.map(c => c["val"]).every(v => v instanceof BoolValue));

        // Did any of the sub-evaluation contexts assign a new value to a state variable?
        let assignedInSub = retCtxs.some(c => {
            let assignedVars = _.keys(c["state"].stateVars).filter(k => c["state"].stateVars[k] !== null)
            return assignedVars.length > currAssignedVars.length;
            // evalLog("assigned vars:",assignedVars);
            return assignedVars;
        });

        // If new variables were assigned in the sub-evaluation contexts, then we return all of the
        // generated contexts. If no new variables were assigned, then we return the disjunction of
        // the results.
        if (assignedInSub) {
            evalLog("Newly assigned vars, returning ", retCtxs);
            return retCtxs;
        } else {
            evalLog("No newly assigned vars.");
            let someTrue = retCtxs.map((c) => c["val"].getVal()).some(_.identity);
            evalLog("ctx.", ctx);

            return [ctx.withVal(new BoolValue(someTrue))]
        }
    }
    return retCtxs;
}

function evalLor(lhs, rhs, ctx) {
    assert(ctx instanceof Context);

    let currAssignedVars = _.keys(ctx["state"].stateVars).filter(k => ctx["state"].stateVars[k] !== null)

    // return {"val": false, "states": vars};
    evalLog("## LOR");
    evalLog("orig ctx:", ctx);
    // For all existing possible variable assignments split into
    // separate evaluation cases for left and right branch.
    let ctxLhs = evalExpr(lhs, ctx);
    evalLog("lhs ctx:", ctxLhs);
    let ctxRhs = evalExpr(rhs, ctx);

    let retCtxs = ctxLhs.concat(ctxRhs);

    return processDisjunctiveContexts(ctx, retCtxs, currAssignedVars);
    // return ctxLhs.concat(ctxRhs);
}

// Checks if a syntax tree node represents a primed variable.
function isPrimedVar(treeNode, ctx) {
    if (treeNode.children.length < 2) {
        return false;
    }
    let lhs = treeNode.children[0];
    let symbol = treeNode.children[1];
    evalLog("lhs text:", lhs.text);
    evalLog("lhs text:", ctx.state);
    return (treeNode.type === "bound_postfix_op" &&
        lhs.type === "identifier_ref" &&
        symbol.type === "prime" &&
        ctx.state.hasVar(lhs.text) && ctx.state.getVarVal(lhs.text) !== null);
}

function evalEq(lhs, rhs, ctx) {
    assert(ctx instanceof Context);

    // Deal with equality of variable on left hand side.
    let identName = lhs.text;

    // let isUnprimedVar = ctx["state"].hasOwnProperty(identName) && !isPrimedVar(lhs);
    let isUnprimedVar = ctx.state.hasVar(identName) && !isPrimedVar(lhs, ctx);

    if (isPrimedVar(lhs, ctx) || (isUnprimedVar && !ASSIGN_PRIMED)) {
        // Update assignments for all current evaluation ctx.

        // If, in the current state assignment, the variable has not already
        // been assigned a value, then assign it.If it has already been assigned,
        // then check for equality.
        // Variable already assigned in this context. So, check for equality.
        if (ctx.state.hasVar(identName) && ctx.state.getVarVal(identName) !== null) {
            evalLog("Variable '" + identName + "' already assigned in ctx:", ctx);
            let rhsVals = evalExpr(rhs, ctx);
            assert(rhsVals.length === 1);
            let rhsVal = rhsVals[0]["val"]
            evalLog("rhsVal:", rhsVal);
            let lhsVals = evalExpr(lhs, ctx)[0]["val"];
            let boolVal = (lhsVals.fingerprint() === rhsVal.fingerprint())
            return [ctx.withVal(new BoolValue(boolVal))];
        }

        // Variable not already assigned. So, update variable assignment as necessary.
        let stateUpdated = _.mapValues(ctx.state.getStateObj(), (val, key, obj) => {
            if (key === identName) {
                evalLog("Variable (" + identName + ") not already assigned in ctx:", ctx);
                let rhsVals = evalExpr(rhs, ctx.clone());
                assert(rhsVals.length === 1);
                let rhsVal = rhsVals[0]["val"];
                evalLog("Variable (" + identName + ") getting value:", rhsVal);
                let vret = (val === null) ? rhsVal : val;
                evalLog(vret);
                return vret;
            }
            return val;
        });
        evalLog("state updated:", stateUpdated);
        evalLog("state updated current ctx:", ctx);
        return [ctx.withValAndState(new BoolValue(true), new TLAState(stateUpdated))];
    } else {
        evalLog(`Checking for equality of ident '${identName}' with '${rhs.text}'.`, ctx);

        // Evaluate left and right hand side.
        // evalLog("eq lhs:", lhs);
        let lhsVals = evalExpr(lhs, ctx.clone());
        assert(lhsVals.length === 1);
        let lhsVal = lhsVals[0]["val"];
        // console.log("Checking for eq, lhsVal", lhsVal);

        let rhsVals = evalExpr(rhs, ctx.clone());
        assert(rhsVals.length === 1);
        let rhsVal = rhsVals[0]["val"];
        // console.log("Checking for eq, rhsVal", rhsVal);

        // Check equality.
        // TODO: Update this equality check.
        const boolVal = lhsVal.fingerprint() === rhsVal.fingerprint();
        evalLog("Checking for, boolVal:", boolVal);

        // Return context with updated value.
        return [ctx.withVal(new BoolValue(boolVal))];
    }
}

function evalUnchanged(node, ctx) {
    evalLog("eval UNCHANGED:", node);

    let unchangedVal = node.namedChildren[1];

    // If we encounter an UNCHANGED expression where the right hand side is a
    // non-variable identifier, then we try to recursively perform all possible
    // substitutions based on definitions in current context. 
    while (unchangedVal.type === "identifier_ref" && ctx.defns.hasOwnProperty(unchangedVal.text)) {
        let defnVal = ctx.defns[unchangedVal.text];
        evalLog("unchanged defn: ", defnVal);
        unchangedVal = defnVal.node;
    }
    evalLog("eval prefix op: UNCHANGED val", unchangedVal, unchangedVal.text);

    if (unchangedVal.type === "tuple_literal") {
        // Handle case where tuple consists of identifier_refs.
        let tupleElems = unchangedVal.namedChildren
            .filter(c => c.type === "identifier_ref");
        for (const elem of tupleElems) {
            evalLog("elem:", elem);

            // Assign the primed version of this variable identifer to the same
            // value as the unprimed version.
            let unprimedVarVal = evalExpr(elem, ctx)[0]["val"];
            evalLog("unprimed Val: ", unprimedVarVal);

            // Update the primed variable.
            let primedVarName = elem.text + "'";
            ctx.state = ctx.state.withVarVal(primedVarName, unprimedVarVal);
            // evalLog(ctx.state);
        }
        return [ctx.withVal(new BoolValue(true))];

    } else {
        // Assume identifier_ref node.
        assert(unchangedVal.type === "identifier_ref");
        let unprimedVarVal = evalExpr(unchangedVal, ctx)[0]["val"];
        // Update the primed variable.
        let primedVarName = unchangedVal.text + "'";
        ctx.state = ctx.state.withVarVal(primedVarName, unprimedVarVal);
        // evalLog(ctx.state);
        return [ctx.withVal(new BoolValue(true))];
    }
}

// 'vars' is a list of possible partial state assignments known up to this point.
function evalBoundInfix(node, ctx) {
    assert(ctx instanceof Context);

    evalLog("evalBoundInfix:", node);

    // lhs.
    let lhs = node.children[0];
    // symbol.
    let symbol = node.children[1];
    // console.log("symbol:", node.children[1].type);
    // rhs
    let rhs = node.children[2];

    // Multiplication
    if (symbol.type === "mul") {
        evalLog("mul lhs:", lhs, lhs.text);
        let mulLhsVal = evalExpr(lhs, ctx);
        evalLog("mul lhs val:", mulLhsVal);
        let lhsVal = mulLhsVal[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        let outVal = lhsVal.getVal() * rhsVal.getVal();
        // console.log("mul overall val:", outVal);
        return [ctx.withVal(new IntValue(outVal))];
    }

    // Plus.
    if (symbol.type === "plus") {
        evalLog("plus lhs:", lhs, lhs.text);
        let plusLhsVal = evalExpr(lhs, ctx);
        evalLog("plus lhs val:", plusLhsVal);
        let lhsVal = plusLhsVal[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert(lhsVal instanceof IntValue);
        assert(rhsVal instanceof IntValue);
        let outVal = lhsVal.plus(rhsVal);
        return [ctx.withVal(outVal)];
    }

    // Plus.
    if (symbol.type === "minus") {
        evalLog("minus lhs:", lhs, lhs.text);
        let minusLhsVal = evalExpr(lhs, ctx);
        evalLog("minus lhs val:", minusLhsVal);
        let lhsVal = minusLhsVal[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert(lhsVal instanceof IntValue);
        assert(rhsVal instanceof IntValue);
        let outVal = lhsVal.minus(rhsVal);
        return [ctx.withVal(outVal)];
    }

    // Greater than.
    if (symbol.type === "gt") {
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert(lhsVal instanceof IntValue);
        assert(rhsVal instanceof IntValue);
        let outVal = lhsVal.getVal() > rhsVal.getVal();
        return [ctx.withVal(new BoolValue(outVal))];
    }

    // Less than.
    if (symbol.type === "lt") {
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert(lhsVal instanceof IntValue);
        assert(rhsVal instanceof IntValue);
        let outVal = lhsVal.getVal() < rhsVal.getVal();
        return [ctx.withVal(new BoolValue(outVal))];
    }

    // Greater than or equal.
    if (symbol.type === "geq") {
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert(lhsVal instanceof IntValue);
        assert(rhsVal instanceof IntValue);
        let outVal = lhsVal.getVal() >= rhsVal.getVal();
        return [ctx.withVal(new BoolValue(outVal))];
    }

    // Less than or equal.
    if (symbol.type === "leq") {
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert(lhsVal instanceof IntValue);
        assert(rhsVal instanceof IntValue);
        let outVal = lhsVal.getVal() <= rhsVal.getVal();
        return [ctx.withVal(new BoolValue(outVal))];
    }

    // Modulo
    if (symbol.type === "mod") {
        evalLog("mul lhs:", lhs, lhs.text);
        let mulLhsVal = evalExpr(lhs, ctx);
        evalLog("mul lhs val:", mulLhsVal);
        let lhsVal = mulLhsVal[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        let outVal = lhsVal.getVal() % rhsVal.getVal();
        // console.log("mul overall val:", outVal);
        return [ctx.withVal(new IntValue(outVal))];
    }

    // Disjunction.
    if (symbol.type === "lor") {
        return evalLor(lhs, rhs, ctx);
    }

    if (symbol.type === "land") {
        return evalLand(lhs, rhs, ctx);
    }

    // Implication.
    if (symbol.type === "implies") {
        // (a => b) <=> (~a \/ b)
        let a = evalExpr(lhs, ctx)[0]["val"];
        let b = evalExpr(rhs, ctx)[0]["val"];
        return [ctx.withVal(new BoolValue(!a.getVal() || b.getVal()))];
    }

    // Equality.
    if (symbol.type === "eq") {
        // console.log("bound_infix_op, symbol 'eq', ctx:", JSON.stringify(ctx));
        evalLog("bound_infix_op -> (eq), ctx:", ctx);
        return evalEq(lhs, rhs, ctx);
    }

    // Inequality.
    if (symbol.type === "neq") {
        // console.log("bound_infix_op, symbol 'neq', ctx:", JSON.stringify(ctx));
        evalLog("bound_infix_op -> (neq), ctx:", ctx);

        let lident = lhs.text;
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        // console.log("Checking for inequality with var:", varName);
        let rhsVals = evalExpr(rhs, ctx);
        assert(rhsVals.length === 1);
        let rhsVal = rhsVals[0]["val"];
        let areUnequal = lhsVal.fingerprint() !== rhsVal.fingerprint();
        // console.log("inequality lhsVal:", lhsVal);
        // console.log("inequality rhsVal:", rhsVal);
        evalLog("inequality boolVal:", areUnequal);
        // Return context with updated value.
        return [ctx.withVal(new BoolValue(areUnequal))];
    }

    // Set membership.
    if (symbol.type === "in" || symbol.type === "notin") {
        // We should have rewritten these during AST pre-processing.
        assert(symbol.type !== "in");
        assert(symbol.type !== "notin");
    }

    // Set intersection.
    if (symbol.type === "cap") {
        evalLog("bound_infix_op, symbol 'cap'");
        // TODO: Will eventually need to figure out a more principled approach to object equality.
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        evalLog("cap lhs:", lhsVal);
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        evalLog("cap rhs:", rhsVal);
        assert(lhsVal instanceof SetValue);
        assert(rhsVal instanceof SetValue);
        return [ctx.withVal(lhsVal.intersectionWith(rhsVal))];
    }

    // Set union.
    if (symbol.type === "cup") {
        // console.log("bound_infix_op, symbol 'cup'");
        evalLog("bound_infix_op, symbol 'cup'");
        // TODO: Will eventually need to figure out a more principled approach to object equality.
        evalLog(lhs);
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        evalLog("cup lhs:", lhsVal);
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        evalLog("cup rhs:", lhsVal);
        assert(lhsVal instanceof SetValue);
        assert(rhsVal instanceof SetValue);
        return [ctx.withVal(lhsVal.unionWith(rhsVal))];
    }

    // Set minus.
    if (symbol.type === "setminus") {
        // console.log("bound_infix_op, symbol 'setminus'");
        evalLog("bound_infix_op, symbol 'setminus'");
        // TODO: Will need to figure out a more principled approach to object equality.
        evalLog(lhs);
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        evalLog("setminus lhs:", lhsVal);
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        evalLog("setminus rhs:", lhsVal);
        assert(lhsVal instanceof SetValue);
        assert(rhsVal instanceof SetValue);
        return [ctx.withVal(lhsVal.diffWith(rhsVal))];
    }

    // Set product. ("\X" or "\times")
    if (symbol.type === "times") {
        evalLog("bound_infix_op, symbol 'times'");
        evalLog(lhs);
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        evalLog("times lhs:", lhsVal);
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        evalLog("times rhs:", lhsVal);
        assert(lhsVal instanceof SetValue);
        assert(rhsVal instanceof SetValue);
        let prodElems = cartesianProductOf(lhsVal.getElems(), rhsVal.getElems()).map(e => new TupleValue(e));
        return [ctx.withVal(new SetValue(prodElems))];
    }

    // Enumerated set with dot notation e.g. 1..N
    if (symbol.type === "dots_2") {
        // Assume both operands evaluate to numbers.
        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert(lhsVal instanceof IntValue);
        assert(rhsVal instanceof IntValue);
        let rangeVal = _.range(lhsVal.getVal(), rhsVal.getVal() + 1).map(x => new IntValue(x));
        return [ctx.withVal(new SetValue(rangeVal))];
    }

    //
    // Infix operators from TLC.tla standard module.
    //

    // d :> e == [x \in {d} |-> e]
    if (symbol.type === "map_to") {
        evalLog("bound_infix_op, symbol 'map_to', ctx:", ctx);
        let lhs = node.namedChildren[0];
        let rhs = node.namedChildren[2];

        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];

        let fcnVal = new FcnRcdValue([lhsVal], [rhsVal]);
        return [ctx.withVal(fcnVal)];
    }

    // f @@ g == [x \in (DOMAIN f) \cup (DOMAIN g) |-> IF x \in DOMAIN f THEN f[x] ELSE g[x]]
    if (symbol.type === "compose") {
        evalLog("bound_infix_op, symbol 'compose', ctx:", ctx);
        let lhs = node.namedChildren[0];
        let rhs = node.namedChildren[2];

        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];

        return [ctx.withVal(lhsVal.compose(rhsVal))];
    }

    // e.g. <<1,2>> \o <<3,4,5>>
    if (symbol.type === "circ") {
        evalLog("bound_infix_op, symbol 'circ', ctx:", ctx);
        let lhs = node.namedChildren[0];
        let rhs = node.namedChildren[2];

        let lhsVal = evalExpr(lhs, ctx)[0]["val"];
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];
        assert((lhsVal instanceof TupleValue) || (lhsVal instanceof FcnRcdValue));
        assert((rhsVal instanceof TupleValue) || (rhsVal instanceof FcnRcdValue));

        if (lhsVal instanceof FcnRcdValue) {
            lhsVal = lhsVal.toTuple();
        }
        if (rhsVal instanceof FcnRcdValue) {
            rhsVal = rhsVal.toTuple();
        }

        let newTupVal = lhsVal.concatTup(rhsVal);
        return [ctx.withVal(newTupVal)];
    }

    throw new Error("unsupported infix symbol: '" + symbol.text + "'");

}

function evalEnabled(node, ctx) {
    let rhs = node.childForFieldName("rhs");
    let rhsVal = evalExpr(rhs, ctx)[0]["val"];
    evalLog("rhs ENABLED: ", rhsVal);
    assert(rhsVal instanceof BoolValue);
    return [ctx.withVal(rhsVal)];
}

function evalBoundPrefix(node, ctx) {
    let symbol = node.children[0];
    let rhs = node.children[1];
    evalLog("evalBoundPrefix: ", node.type, ", ", node.text, `, prefix symbol: '${symbol.type}' `, "ctx:", ctx);

    // ENABLED.
    if (symbol.type === "enabled") {
        return evalEnabled(node, ctx);
    }

    // DOMAIN.
    if (symbol.type === "domain") {
        evalLog("DOMAIN op");
        evalLog(rhs);
        let rhsVal = evalExpr(rhs, ctx)[0]["val"];

        // Tuples are considered as functions with natural number domains.
        if (rhsVal instanceof TupleValue) {
            evalLog("rhsVal is Tuple");
            // Tuples are 1-indexed in TLA+.
            let rangeVals = _.range(1, rhsVal.length() + 1).map(v => new IntValue(v));
            let domainVal = new SetValue(rangeVals);
            return [ctx.withVal(domainVal)];
        }

        evalLog("rhsVal: ", rhsVal);
        let domainVal = new SetValue(rhsVal.getDomain());
        evalLog("domain val: ", domainVal);
        return [ctx.withVal(domainVal)];
    }

    if (symbol.type === "powerset") {
        evalLog("POWERSET op");
        evalLog(rhs);
        let rhsVal = evalExpr(rhs, ctx);
        evalLog("rhsVal: ", rhsVal);
        rhsVal = rhsVal[0]["val"];
        let powersetRhs = subsets(rhsVal.getElems());
        // console.log("powersetRhs:", powersetRhs);
        powersetRhs = powersetRhs.map(x => new SetValue(x));
        // evalLog("powerset:",powersetRhs);
        return [ctx.withVal(new SetValue(powersetRhs))];
    }
    if (symbol.type === "negative") {
        let rhsVal = evalExpr(rhs, ctx);
        rhsVal = rhsVal[0]["val"];
        return [ctx.withVal(new IntValue(-rhsVal))];
    }

    if (symbol.type === "lnot") {
        return evalLnot(rhs, ctx);
    }


    if (symbol.type === "unchanged") {
        evalLog("eval prefix op: UNCHANGED", node);
        // assert(false, "UNCHANGED under construction!");
        return evalUnchanged(node, ctx);


    }
}

function evalBoundPostfix(node, ctx) {
    let lhs = node.namedChildren[0];
    let symbol = node.namedChildren[1];

    evalLog("POSTFIX:", node);
    if (symbol.type === "prime") {
        return evalExpr(lhs, ctx.withPrimed());
    }

    return;

}

function evalDisjList(parent, disjs, ctx) {
    assert(ctx instanceof Context);

    evalLog("eval: disjunction list!");

    let currAssignedVars = _.keys(ctx["state"].stateVars).filter(k => ctx["state"].stateVars[k] !== null)

    // Split into separate evaluation cases for each disjunct.
    // Also filter out any comments in this disjunction list.
    // TODO: Process disjunctive contexts properly?
    let retCtxs = _.flattenDeep(disjs.map(disj => evalExpr(disj, ctx)));
    return processDisjunctiveContexts(ctx, retCtxs, currAssignedVars);
}

function evalConjList(parent, conjs, ctx) {
    assert(ctx instanceof Context);

    evalLog("evalConjList -> ctx:", ctx, conjs);

    // Initialize boolean value if needed.
    if (ctx["val"] === null) {
        ctx["val"] = new BoolValue(true);
    }
    // Filter out any comments contained in this conjunction.
    return conjs.filter(c => !["comment", "block_comment"].includes(c.type)).reduce((prev, conj) => {
        let res = prev.map(ctxPrev => {
            // If this context has already evaluated to false, then the overall
            // conjunction list will evaluate to false, so we can short-circuit
            // the expression evaluation and terminate early.
            if (ctxPrev["val"].getVal() === false) {
                return [ctxPrev];
            }

            return evalExpr(conj, ctxPrev).map(ctxCurr => {
                let conjVal = ctxCurr["val"].and(ctxPrev["val"]);
                return ctxCurr.withVal(conjVal);
            });
        });
        evalLog("evalConjList mapped: ", res);
        return _.flattenDeep(res);
    }, [ctx]);
}

function evalIdentifierRef(node, ctx) {
    assert(ctx instanceof Context);

    let ident_name = node.text;
    evalLog(`evalIdentifierRef, '${node.text}' context:`, ctx, "ident_name:", ident_name);

    // Are we in a "primed" evaluation context.
    let isPrimed = ctx.isPrimed();

    // If this identifier refers to a variable, return the value bound
    // to that variable in the current context.
    if (ctx.state.hasVar(ident_name) && !isPrimed) {
        evalLog("variable identifier: ", ident_name);
        let var_val = ctx.state.getVarVal(ident_name);
        evalLog("var ident context:", ctx["state"], var_val);
        return [ctx.withVal(var_val)];
    }

    // Evaluate identifier for primed context version.
    if (ctx.state.hasVar(ident_name + "'") && isPrimed) {
        evalLog("variable identifier (primed): ", ident_name + "'");
        let var_val = ctx.state.getVarVal(ident_name + "'");
        evalLog("var ident context:", ctx["state"], var_val);
        return [ctx.withVal(var_val)];
    }

    // See if the identifier is bound to a value in the current context.
    // If so, return the value it is bound to.
    if (ctx.hasOwnProperty("quant_bound") && ctx["quant_bound"].hasOwnProperty(ident_name)) {
        let bound_val = ctx["quant_bound"][ident_name];
        evalLog("bound_val", bound_val);
        return [ctx.withVal(bound_val)];
    }

    // See if this identifier is a definition in the spec.
    if (ctx.hasOwnProperty("defns") && ctx["defns"].hasOwnProperty(ident_name)) {
        // Evaluate the definition in the current context.
        let defNode = ctx["defns"][ident_name]["node"];

        // Handle function definition case.
        if (defNode.type === "function_definition") {
            let quant_bounds = defNode.namedChildren.filter(n => n.type === "quantifier_bound");
            let fexpr = _.last(defNode.namedChildren);
            return evalFunctionLiteralInner(ctx, quant_bounds, fexpr);

        }
        return evalExpr(defNode, ctx);
    }

    // See if this identifier is an instantiated CONSTANT symbol.
    if (ctx["constants"] !== undefined && ctx["constants"].hasOwnProperty(ident_name)) {
        // Return the instantiated constant value.
        let constantVal = ctx["constants"][ident_name];
        return [ctx.withVal(constantVal)];
    }

    // TODO: Consider case of being undefined.
}

function evalBoundedQuantification(node, ctx) {
    evalLog("bounded_quantification", node);

    //
    // Assume all quantifiers have previously been put into a normalized form during 
    // syntactic pre-processing i.e.
    //
    // \E i1 \in S1 : \E i2 \in S2 : ... : \E in \in Sn : <expr>
    //
    // <quantfier> \in <bound> : <expression>
    let quantBoundNodes = node.namedChildren.filter(c => c.type === "quantifier_bound");
    // Only a single quantifier bound.
    assert(quantBoundNodes.length === 1);
    // Only single identifier within this quantifier bound.
    assert(quantBoundNodes[0].namedChildren.filter(c => c.type === "identifier").length === 1);

    let quantifier = node.namedChildren[0];
    assert(quantifier.type === "exists" || quantifier.type === "forall");

    // Extract all quantifier bounds/domains.
    // TODO: This should likely be obsolete now since we should have
    // always normalized down to a single quantifier bound in all cases.
    let currInd = 1;
    quantBounds = [];
    while (node.namedChildren[currInd].type === "quantifier_bound") {
        quantBounds.push(node.namedChildren[currInd]);
        currInd += 1;
    }

    let quantBound = node.namedChildren[1];

    // The quantified expression.
    let quant_expr = node.namedChildren[currInd];
    evalLog("quant bound:", quantBound);
    evalLog("quant expr:", quant_expr);

    evalLog("qbound child:", quantBound.namedChildren);
    let domainVal = evalExpr(quantBound.lastNamedChild, ctx)[0]["val"];
    assert(domainVal instanceof SetValue);
    let quantDomain = domainVal.getElems();

    let quantIdent = quantBound.namedChildren.filter(c => c.type === "identifier")[0].text;
    evalLog("quantDomain: ", quantDomain);
    evalLog("quantIdent: ", quantIdent);

    // Iterate over the product of all quantified domains and evaluate
    // the quantified expression with the appropriately bound values.

    // Trivial case of empty domain.
    if (quantDomain.length === 0) {
        // \forall x \in {} : <expr> is always true.
        // \exists x \in {} : <expr> is always false.
        let retVal = (quantifier.type === "forall");
        return [ctx.withVal(new BoolValue(retVal))];
    }

    let currAssignedVars = _.keys(ctx["state"].stateVars).filter(k => ctx["state"].stateVars[k] !== null)

    // Evaluate each sub-expression with the properly bound values.
    retCtxs = _.flattenDeep(quantDomain.map(domVal => {
        let boundContext = ctx.clone();
        // Bound values to quantified variables.
        if (!boundContext.hasOwnProperty("quant_bound")) {
            boundContext["quant_bound"] = {};
        }
        boundContext["quant_bound"][quantIdent] = domVal;
        evalLog("quantDomain val:", domVal);
        evalLog("boundContext:", boundContext);
        let ret = evalExpr(quant_expr, boundContext.clone());
        return ret;
    }));

    evalLog("quant returned contexts:", retCtxs);

    // If this is a universal quantifier, then we don't fork the evaluation.
    if (quantifier.type === "forall") {
        let allVals = retCtxs.map(c => c["val"].getVal());
        evalLog("allVals:", allVals);
        let res = _.every(retCtxs.map(c => c["val"].getVal()));
        return [ctx.withVal(new BoolValue(res))];
    }

    assert(quantifier.type === "exists");
    return processDisjunctiveContexts(ctx, retCtxs, currAssignedVars);
}

// <op>(<arg1>,...,<argn>)
function evalBoundOp(node, ctx) {
    assert(node.type === "bound_op");

    let opName = node.namedChildren[0].text;
    evalLog("bound_op:", opName);
    evalLog("bound_op context:", ctx);

    //
    // Operators from the TLA+ Standard Modules.
    //
    // Treat these all as built-in operators for now.
    //

    // FiniteSets 
    // https://github.com/tlaplus/tlaplus/blob/421bc3d16f869d9c9bb493e5950c445c25c916ea/tlatools/org.lamport.tlatools/src/tla2sany/StandardModules/FiniteSets.tla

    // Built in operator.
    if (opName == "Cardinality") {
        let argExpr = node.namedChildren[1];
        let argExprVal = evalExpr(argExpr, ctx)[0]["val"]
        evalLog("Cardinality val:", argExpr.text, argExprVal.length);
        return [ctx.withVal(new IntValue(argExprVal.size()))];
    }

    // Sequences 
    // https://github.com/tlaplus/tlaplus/blob/421bc3d16f869d9c9bb493e5950c445c25c916ea/tlatools/org.lamport.tlatools/src/tla2sany/StandardModules/Sequences.tla    

    if (opName == "Seq") {
        // TODO.
        throw new Exception("'Seq' operator unimplemented.");
    }

    if (opName == "Len") {
        let seqArgExpr = node.namedChildren[1];
        let seqArgExprVal = evalExpr(seqArgExpr, ctx)[0]["val"]

        // Try to interpret value as tuple, if possible.
        seqArgExprVal = seqArgExprVal.toTuple();

        assert(seqArgExprVal instanceof TupleValue);
        // evalLog("Append val:", seqArgExpr.text);
        return [ctx.withVal(new IntValue(seqArgExprVal.length()))];
    }

    // Append(seq, v)
    if (opName == "Append") {
        let seqArgExpr = node.namedChildren[1];
        let appendElemArgExpr = node.namedChildren[2];
        let seqArgExprVal = evalExpr(seqArgExpr, ctx)[0]["val"]

        // Try to interpret value as tuple, if possible.
        seqArgExprVal = seqArgExprVal.toTuple();

        let appendElemArgExprVal = evalExpr(appendElemArgExpr, ctx)[0]["val"]

        assert(seqArgExprVal instanceof TupleValue);

        // evalLog("Append val:", seqArgExpr.text);
        return [ctx.withVal(seqArgExprVal.append(appendElemArgExprVal))];
    }

    if (opName == "Head") {
        let seqArgExpr = node.namedChildren[1];
        let seqArgExprVal = evalExpr(seqArgExpr, ctx)[0]["val"]

        // Try to interpret value as tuple, if possible.
        seqArgExprVal = seqArgExprVal.toTuple();

        assert(seqArgExprVal instanceof TupleValue);
        // evalLog("Append val:", seqArgExpr.text);
        return [ctx.withVal(seqArgExprVal.head())];
    }

    if (opName == "Tail") {
        let seqArgExpr = node.namedChildren[1];
        let seqArgExprVal = evalExpr(seqArgExpr, ctx)[0]["val"]

        // Try to interpret value as tuple, if possible.
        seqArgExprVal = seqArgExprVal.toTuple();

        assert(seqArgExprVal instanceof TupleValue);
        // evalLog("Append val:", seqArgExpr.text);
        return [ctx.withVal(seqArgExprVal.tail())];
    }

    // Check for the bound op in the set of known definitions.
    if (ctx["defns"].hasOwnProperty(opName)) {
        let opDefNode = ctx["defns"][opName]["node"];
        let opDefObj = ctx["defns"][opName];
        let opArgs = opDefObj["args"];
        evalLog("defns", node);
        evalLog("opDefObj", opDefObj);

        // n-ary operator.
        if (opArgs.length >= 1) {
            // Evaluate each operator argument.
            let opArgsEvald = node.namedChildren.slice(1).map(oarg => evalExpr(oarg, ctx));
            let opArgVals = _.flatten(opArgsEvald);
            evalLog("opArgVals:", opArgVals);

            // Then, evaluate the operator defininition with these argument values bound
            // to the appropriate names.
            let opEvalContext = ctx.clone();
            if (!opEvalContext.hasOwnProperty("quant_bound")) {
                opEvalContext["quant_bound"] = {};
            }

            evalLog("opDefNode", opDefNode);
            for (var i = 0; i < opArgs.length; i++) {
                // The parameter name in the operator definition.
                let paramName = opArgs[i];
                // console.log("paramName:", paramName);
                opEvalContext["quant_bound"][paramName] = opArgVals[i]["val"];
            }
            evalLog("opEvalContext:", opEvalContext);
            return evalExpr(opDefNode, opEvalContext);
        }
    }

    // Unknown operator.
    throw new Error("Error: unknown operator '" + opName + "'.");

}

function evalFiniteSetLiteral(node, ctx) {
    // Remove the outer braces, "{" and "}"
    let innerChildren = node.children.slice(1, node.children.length - 1);
    // Remove commas and then evaluate each set element.
    let ret = innerChildren.filter(child => child.type !== ",")
    ret = ret.map(child => {
        // TODO: For now assume set elements don't fork evaluation context.
        let r = evalExpr(child, ctx);
        assert(r.length === 1, "Expected set elements not to fork evaluation");
        return r[0]["val"];
    });
    return [ctx.withVal(new SetValue(ret))];
}

/**
 * Compute all mappings from 'domain' to 'range'
 */
function combs(domain, range) {
    if (domain.length === 0) {
        // An empty domain gives us a single "empty" mapping.
        // Use lists of key-value pairs to represent mappings.
        return [[]];
    }
    let out = [];
    for (const v of range) {
        // Recursively compute combinations for the rest of the domain.
        for (const c of combs(domain.slice(1), range)) {
            c.push([domain[0], v])
            out.push(c);
        }
    }
    return out;
}

function evalSetOfFunctions(node, ctx) {

    // console.log("set_of_functions", node);

    // Domain.
    let Dval = evalExpr(node.namedChildren[0], ctx)[0]["val"];
    // Range.
    let Rval = evalExpr(node.namedChildren[2], ctx)[0]["val"];

    let Delems = Dval.getElems();
    let Relems = Rval.getElems();

    // Compute set of all functions from D -> R by first computing combinations 
    // with replacement i.e. choosing |D| elements from R.
    // 
    // e.g.
    // D : [a,b,c]
    // R : [1,2]
    // |[D -> R]| = 2^3 = 8
    //

    let combVals = combs(Delems, Relems);

    let fcnVals = [];
    for (var comb of combVals) {
        // Each combination should be a list of key-value pairs.
        let domainVals = comb.map(c => c[0]);
        let rangeVals = comb.map(c => c[1]);

        let fv = new FcnRcdValue(domainVals, rangeVals);
        fcnVals.push(fv);
    }

    return [ctx.withVal(new SetValue(fcnVals))];
}

function evalSetOfRecords(node, ctx) {
    let domainVals = [];
    let idents = [];
    for (var ind = 0; ind < node.namedChildren.length; ind += 2) {
        let ident = node.namedChildren[ind];
        idents.push(ident.text);
        let domain = node.namedChildren[ind + 1];
        let domainVal = evalExpr(domain, ctx)[0]["val"];
        assert(domainVal instanceof SetValue);
        evalLog(domainVal);
        domainVals.push(domainVal.getElems());
    }

    let domainTuples = cartesianProductOf(...domainVals);

    // Construct the set of records as the cartesian product of every field domain set.
    let outRecords = []
    for (var domainTuple of domainTuples) {
        let rcdDomain = idents.map(v => new StringValue(v));
        let rcdVals = domainTuple;
        let isRecord = true;
        let recordVal = new FcnRcdValue(rcdDomain, rcdVals, isRecord);
        outRecords.push(recordVal);
    }

    return [ctx.withVal(new SetValue(outRecords))];
}

function evalFunctionLiteralInner(ctx, quant_bounds, fexpr) {

    let idents = quant_bounds.map(qb => {
        let domainVal = evalExpr(_.last(qb.namedChildren), ctx)[0]["val"];
        return qb.namedChildren
            .filter(n => n.type === "identifier")
            .map(x => [x, domainVal.getElems()]);
    });


    let domainIdents = _.flatten(idents).map(pair => pair[0]);
    let domainVals = _.flatten(idents).map(pair => pair[1]);

    evalLog("domainIdents:", domainIdents);
    evalLog("domainVals:", domainVals);

    let domainTuples = cartesianProductOf(...domainVals);
    evalLog("domainTuples:", domainTuples);

    let fcnArgs = domainTuples.map(t => (t.length === 1) ? t[0] : new TupleValue(t));
    let fcnVals = domainTuples.map(tuple => {
        // Evaluate function expression in appropriate context.
        let boundContext = ctx.clone();
        if (!boundContext.hasOwnProperty("quant_bound")) {
            boundContext["quant_bound"] = {};
        }
        for (var ind = 0; ind < domainIdents.length; ind++) {
            let identName = domainIdents[ind].text;
            boundContext["quant_bound"][identName] = tuple[ind];
        }
        evalLog("function_literal boundCtx:", boundContext);
        let vals = evalExpr(fexpr, boundContext);
        evalLog("fexpr vals:", vals);
        assert(vals.length === 1);
        return vals[0]["val"];
    });

    let newFnVal = new FcnRcdValue(fcnArgs, fcnVals);
    return [ctx.withVal(newFnVal)];
}

// "[" <quantifier_bound> "|->" <expr> "]"
function evalFunctionLiteral(node, ctx) {
    evalLog("function_literal: '" + node.text + "'");

    let quant_bounds = node.namedChildren.filter(n => n.type === "quantifier_bound");
    let fexpr = _.last(node.namedChildren);

    return evalFunctionLiteralInner(ctx, quant_bounds, fexpr);

}

function evalLetIn(node, ctx) {
    let opDefs = node.namedChildren.filter(c => c.type === "operator_definition");
    let letInExpr = node.childForFieldName("expression");

    // Evaluate the expression with the bound definitions.
    let newBoundCtx = ctx;
    for (const def of opDefs) {
        let defVarName = def.childForFieldName("name").text;
        // Make sure to evaluate each new LET definition expression in the context of the 
        // previously bound definitions.
        let defVal = evalExpr(def.childForFieldName("definition"), newBoundCtx)[0]["val"];
        // evalLog("defVarName:", defVarName);
        // evalLog("defVal:", defVal);
        newBoundCtx = newBoundCtx.withBoundVar(defVarName, defVal);
    }
    evalLog("newBoundCtx:", newBoundCtx);
    return evalExpr(letInExpr, newBoundCtx);
}

// CHOOSE x \in {1,2} : P(x)
function evalChoose(node, ctx) {
    evalLog("CHOOSE", node);
    let boundVar = node.namedChildren[0];
    let domain = node.namedChildren[2];
    let condition = node.namedChildren[3];

    let domainVal = evalExpr(domain, ctx)[0]["val"];
    evalLog("CHOOSE domain:", domainVal);

    // Pick the first value in domain satisfying the condition.
    // TODO: Should ensure consistent iteration order i.e. by 
    // traversing in order sorted by element hashes.
    for (const val of domainVal.getElems()) {
        evalLog("CHOOSE domain val:", val);
        let boundCtx = ctx.withBoundVar(boundVar.text, val);
        let condVal = evalExpr(condition, boundCtx)[0]["val"];
        if (condVal.getVal()) {
            return [ctx.withVal(val)];
        }
    }

    // No value satisfying the CHOOSE.
    throw "No value satisfying CHOOSE predicate";
}

function evalExcept(node, ctx) {
    evalLog("EXCEPT node, ctx:", node, ctx);
    let lExpr = node.namedChildren[0];
    let updateExprs = node.namedChildren.filter(c => c.type === "except_update");
    let numUpdateExprs = updateExprs.length;

    evalLog("EXCEPT node:", node);
    evalLog("EXCEPT NAMED CHILDREN:", node.namedChildren);
    evalLog("EXCEPT numUpdateExprs:", numUpdateExprs);

    // This value should be a function.
    evalLog("lExpr:", lExpr);
    let lExprVal = evalExpr(lExpr, ctx);
    evalLog("lexprval:", lExprVal);
    // assert(lExprVal.type === "function");

    let origFnVal = lExprVal[0]["val"];
    evalLog("fnVal:", origFnVal);
    // Functions, tuples, and records are all considered as functions.
    assert(origFnVal instanceof FcnRcdValue || origFnVal instanceof TupleValue);

    var wasTuple = false;
    // Convert tuple to function for evaluation.
    if (origFnVal instanceof TupleValue) {
        wasTuple = true;
        origFnVal = origFnVal.toFcnRcd();
    }

    evalLog(updateExprs);

    // General form of EXCEPT update expression:
    // [a EXCEPT !.a.b["c"] = "b", ![2].x = 5]
    let updatedFnVal = origFnVal;
    evalLog("origFnVal:", origFnVal);
    for (const updateExpr of updateExprs) {
        evalLog("UPDATE EXPR:", updateExpr);
        let updateSpec = updateExpr.namedChildren[0];
        let newVal = updateExpr.childForFieldName("new_val");

        // Handle each update specifier appropriately e.g.
        // !.a.b["c"]
        evalLog("UPDATE SPEC", updateSpec);
        let updateSpecVals = updateSpec.namedChildren.map(c => {
            if (c.type === "except_update_record_field") {
                // Retrieve field from original function/record value.
                evalLog(c);
                evalLog(origFnVal);
                evalLog(c.namedChildren[0].text);
                return new StringValue(c.namedChildren[0].text);
            } else if (c.type === "except_update_fn_appl") {
                evalLog("except_update_fn_appl", c);
                return evalExpr(c.namedChildren[0], ctx)[0]["val"];
            }
        });

        evalLog("updateSpecVals:", updateSpecVals);

        let newCtx = ctx.clone();
        pathArg = updateSpecVals;
        newCtx.prev_func_val = origFnVal.applyPathArg(pathArg);
        evalLog("new ctx:", newCtx);
        let newRhsVal = evalExpr(newVal, newCtx)[0]["val"];
        // evalLog("updating with path arg:", updateSpecVals);
        updatedFnVal = updatedFnVal.updateWithPath(updateSpecVals, newRhsVal);
    }

    evalLog("updatedFnVal:", updatedFnVal);

    // If the original value was a tuple, then treat this it as a tuple upon return.
    if (wasTuple) {
        updatedFnVal = new TupleValue(updatedFnVal.getValues());
    }

    return [ctx.withVal(updatedFnVal)];
}

// For debugging.
// TODO: Eventually move this all inside a dedicated class.
let currEvalNode = null;

/**
 * Evaluate a TLC expression for generating initial/next states.
 * 
 * In the simplest case, expression evaluation simply takes in an expression and
 * returns a TLA value. When we are evaluating an expression in the form of an
 * initial state or next state predicate, however, things are more involved. 
 * 
 * That is, when evaluating an initial/next state predicate for generating
 * states, evaluation returns both a boolean value (TRUE/FALSE) as well as an
 * assignment of values to variables. For example, in the context of initial
 * state generation, this is an assignment of values to all variables x1,...,xn
 * declared in a specification. In the context of next state generation, this is
 * an assignment of values to all variables x1,...,xn,x1',...,xn' i.e. the
 * "current" state variables and the "next"/"primed" copy of the state
 * variables. 
 * 
 * Additionally, when generating states during this type of evaluation, we may
 * produce not only a single return value, but a set of return values. That is,
 * we may have one return value for each potential "branch" of the evaluation,
 * corresponding to possible disjunctions that appear in a predicate. For
 * example, the initial state predicate x = 0 \/ x = 1 will produce two possible
 * return values, both of which evaluate to TRUE and which assign the values of
 * 0 and 1, respectively, to the variable 'x'.
 * 
 * To handle this type of evaluation strategy, we allow expression evaluation to
 * take in a current 'Context' object, which consists of several items for
 * tracking data needed during evaluation. See the fields of the 'Context' class
 * definition for an explanation of what data is tracked during expression
 * evaluation.
 * 
 * Expression evaluation can return a list of these context objects, one for
 * each potential evaluation branch of a given expression. Each returned context
 * can contain an assignment of values to variables along with a return value
 * for that expression.
 *
 * In our implementation, we have each evaluation handler function (i.e.
 * 'eval<NAME>') take in a single context object, and return potentially many
 * contexts. This makes it easier to implement each evaluation handler function,
 * by focusing just on how to evaluate an expression given a single context, and
 * either update it, or fork it into multiple new sub-contexts. From this
 * perspective, we can think about the overall evaluation computation as a tree,
 * where each evaluation function takes in a single branch of the tree, and may
 * potentially create several new forks in the tree, corresponding to separate
 * evaluation sub-branches. When the overall computation terminates, each leaf
 * of the tree should represent the result of one evaluation branch, which will
 * contain both a return value for the expression and a potential assignment of
 * values to variables.
 * 
 * @param {TLASyntaxNode} node: TLA+ tree sitter syntax node representing the expression to evaluate.
 * @param {Context} ctx: a 'Context' instance under which to evaluate the given expression.
 * @returns 
 */
function evalExpr(node, ctx) {
    assert(ctx instanceof Context);

    // Record for debugging purposes.
    currEvalNode = node;
    // console.log("currEvalNode:", currEvalNode);

    // evalLog("$$ evalExpr, node: ", node);
    evalLog("evalExpr -> (" + node.type + ") '" + node.text + "'");

    if (node.type === "parentheses") {
        // evalLog(node);
        return evalExpr(node.namedChildren[0], ctx);
    }

    if (node.type === "let_in") {
        evalLog("LETIN node, ctx:", ctx);
        return evalLetIn(node, ctx);
    }

    if (node.type === "prev_func_val") {
        evalLog(ctx);
        assert(ctx.prev_func_val !== null);
        evalLog("eval prev func");
        return [ctx.withVal(ctx.prev_func_val)];
    }


    if (node.type === "choose") {
        return evalChoose(node, ctx);
    }

    // [<lExpr> EXCEPT ![<updateExpr>] = <rExpr>]
    if (node.type === "except") {
        return evalExcept(node, ctx);
    }

    // <fnVal>[<fnArgVal>] e.g. 'f[3]'
    if (node.type === "function_evaluation") {
        evalLog("function_evaluation: ", node.text);

        let fnVal = evalExpr(node.namedChildren[0], ctx)[0]["val"];
        let fnArgVal;

        // Multi-argument function evaluation, treated as tuple argument.
        if (node.namedChildren.length > 2) {
            let argVals = node.namedChildren.slice(1).map(c => evalExpr(c, ctx)[0]["val"]);
            fnArgVal = new TupleValue(argVals);
        } else {
            // Single argument function evaluation.
            fnArgVal = evalExpr(node.namedChildren[1], ctx)[0]["val"];
        }

        evalLog("fneval (fnval,fnarg): ", fnVal, ",", fnArgVal);
        // Tuples are considered as functions with natural number domains.
        let fnValRes;
        if (fnVal instanceof TupleValue) {
            evalLog("applying tuple as function", fnVal);
            assert(fnArgVal instanceof IntValue);
            let index = fnArgVal.getVal();
            // Account for 1-indexing.
            fnValRes = fnVal.getElems()[index - 1];
        } else {
            fnValRes = fnVal.applyArg(fnArgVal);
        }
        evalLog("fnValRes:", fnValRes);
        return [ctx.withVal(fnValRes)];
    }

    if (isPrimedVar(node, ctx)) {
        // See if this variable is already assigned a value in the current context, and if so, return it.
        if (ctx.state.getVarVal(node.text) !== null) {
            return [ctx.withVal(ctx.state.getVarVal(node.text))];
        }
    }


    if (node.type === "comment") {
        // TOOD: Handle properly.
    }
    if (node === undefined) {
        return [ctx.withVal(false)];
    }
    if (node.type === "conj_list") {
        let ret = evalConjList(node, node.children, ctx);
        evalLog("evalConjList ret: ", ret);
        return ret;
    }
    if (node.type === "disj_list") {
        return evalDisjList(node, node.children, ctx);
    }
    if (node.type === "conj_item") {
        conj_item_node = node.children[1];
        return evalExpr(conj_item_node, ctx);
    }
    if (node.type === "disj_item") {
        disj_item_node = node.children[1];
        return evalExpr(disj_item_node, ctx);
    }

    if (node.type === "bound_op") {
        return evalBoundOp(node, ctx)
    }

    if (node.type === "bound_infix_op") {
        // evalLog(node.type + ", ", node.text, ", ctx:", JSON.stringify(contexts));
        return evalBoundInfix(node, ctx);
    }

    if (node.type === "bound_prefix_op") {
        return evalBoundPrefix(node, ctx);
    }

    if (node.type === "bound_postfix_op") {
        return evalBoundPostfix(node, ctx);
    }

    // TODO: Finish this after implementing 'except' node type handling.
    if (node.type === "bounded_quantification") {
        return evalBoundedQuantification(node, ctx);
    }

    if (node.type === "identifier_ref") {
        return evalIdentifierRef(node, ctx);
    }

    if (node.type === "if_then_else") {
        let cond = node.childForFieldName("if");
        let thenNode = node.childForFieldName("then");
        let elseNode = node.childForFieldName("else");

        let condVal = evalExpr(cond, ctx.clone())[0]["val"];
        if (condVal.getVal()) {
            let thenVal = evalExpr(thenNode, ctx.clone());
            evalLog("thenVal", thenVal, thenNode.text);
            return thenVal;
        } else {
            let elseVal = evalExpr(elseNode, ctx.clone());
            evalLog("elseVal", elseVal, elseNode.text, ctx);
            return elseVal;
        }
    }

    // CASE statement.
    if (node.type === "case") {
        let caseArms = node.namedChildren.filter(n => n.type === "case_arm");
        let otherArms = node.namedChildren.filter(n => n.type === "other_arm");
        for (var caseArm of caseArms) {
            let cond = caseArm.namedChildren[0];
            let out = caseArm.namedChildren[2];
            let condVal = evalExpr(cond, ctx)[0]["val"];
            evalLog("condVal: ", condVal);
            // Short-circuit on the first true condition out of the CASE branches.
            if (condVal.getVal()) {
                let outVal = evalExpr(out, ctx)[0]["val"];
                evalLog("outVal: ", outVal);
                return [ctx.withVal(outVal)];
            }
        }

        // If we get here, it means none of the case arm conditions evaluated to
        // true, so we now check for an OTHER arm. If none exists, throw an
        // error.
        if (otherArms.length === 0) {
            throw new Exception("No CASE condition was TRUE.")
        } else {
            let out = otherArms[0].namedChildren[1];
            evalLog("Evaluating OTHER case arm.", out);
            let otherExprVal = evalExpr(out, ctx)[0]["val"];
            return [ctx.withVal(otherExprVal)];
        }
    }

    // [<D_expr> -> <R_expr>]
    // e.g. [{"x","y"} -> {1,2}]
    if (node.type === "set_of_functions") {
        return evalSetOfFunctions(node, ctx);
    }

    // [<fieldname> : <D_expr>, ..., <fieldnameN> : <D_exprN>]
    // e.g. [a : {1,2}, b : {3,4}]
    if (node.type === "set_of_records") {
        return evalSetOfRecords(node, ctx);
    }

    //
    // {<bound_expr> : <setin_expr>}
    // e.g. 
    // { x+2 : x \in {1,2,3}}
    // {<<a, b>> : a \in 1..3, b \in 1..3}
    //
    // In general, set maps can look like:
    // {<expr> : a,b \in S1, c \in S2}
    //
    if (node.type === "set_map") {
        evalLog("SET_MAP");
        let lhsExpr = node.namedChildren[0];
        let rightQuantBounds = node.namedChildren.filter(n => n.type === "quantifier_bound");

        // Extract set of quantified variables and their domains.
        let identsAndDomains = rightQuantBounds.map(qb => {
            evalLog("qb:", qb);
            let qDomain = evalExpr(_.last(qb.namedChildren), ctx)[0]["val"];
            return qb.namedChildren
                .filter(n => n.type === "identifier" || n.type === "tuple_of_identifiers")
                .map(n => {
                    // In this case the domain should be a set of tuples, where each 
                    // element gets bound to the associated identifier in the tuple of
                    // identifiers e.g.
                    // { a+b : <<a,b>> \in {<<1,2>>, <<3,4>>}}
                    if (n.type === "tuple_of_identifiers") {
                        let tupIdentNames = n.namedChildren.filter(c => c.type === "identifier").map(c => c.text);
                        return [tupIdentNames, qDomain]
                    } else {
                        return [n.text, qDomain]
                    }
                });
        });

        identsAndDomains = _.flatten(identsAndDomains);
        evalLog("identsAndDomains", identsAndDomains)

        let idents = _.unzip(identsAndDomains)[0];
        let domains = _.unzip(identsAndDomains)[1].map(v => v.getElems());
        evalLog("domains:", domains);

        let domainProd = cartesianProductOf(...domains);
        evalLog("domainProd:", domainProd);

        let retVal = domainProd.map((tup) => {
            evalLog("tup: ", tup);
            let boundContext = ctx.clone();
            if (!boundContext.hasOwnProperty("quant_bound")) {
                boundContext["quant_bound"] = {};
            }
            var ind = 0;
            for (var name of idents) {
                if (name instanceof Array) {
                    let names = name;
                    console.log("array tup idents:", names);
                    for (var subind = 0; subind < names.length; subind++) {
                        boundContext["quant_bound"][names[subind]] = tup[ind].getElems()[subind];
                    }
                } else {
                    boundContext["quant_bound"][name] = tup[ind];
                }
                ind += 1;
            }
            return evalExpr(lhsExpr, boundContext)[0]["val"];
        })
        return [ctx.withVal(new SetValue(retVal))];
    }

    // {<single_quantifier_bound> : <expr>}
    // {i \in A : <expr>}
    if (node.type === "set_filter") {
        evalLog("SET_FILTER", node);
        // Extract the left and right side of the ":" of the set filter.
        let singleQuantBound = node.namedChildren[0];
        let rhsFilter = node.namedChildren[1];

        // Evaluate the quantified domain.
        assert(singleQuantBound.type === "quantifier_bound");
        evalLog("singleQuantBound:", singleQuantBound, singleQuantBound.text);
        let ident = singleQuantBound.namedChildren[0].text;
        let domainExpr = singleQuantBound.namedChildren[2];
        evalLog(domainExpr);
        let domainExprVal = evalExpr(domainExpr, ctx)[0]["val"];

        evalLog("domainExprVal:", domainExprVal);

        // Return all values in domain for which the set filter evaluates to true.
        let filteredVals = domainExprVal.getElems().filter(exprVal => {
            // Evaluate rhs in context of the bound value and check its truth value.
            let boundContext = ctx.clone();
            if (!boundContext.hasOwnProperty("quant_bound")) {
                boundContext["quant_bound"] = {};
            }
            boundContext["quant_bound"][ident] = exprVal;
            let rhsFilterVal = evalExpr(rhsFilter, boundContext)[0]["val"];
            evalLog("rhsFilterVal:", rhsFilterVal);
            return rhsFilterVal.getVal();
        });
        evalLog("domainExprVal filtered:", filteredVals);
        return [ctx.withVal(new SetValue(filteredVals))];
    }

    // <record>.<field>
    if (node.type === "record_value") {
        evalLog("RECVAL", node);
        let rec = node.namedChildren[0];
        let recField = node.namedChildren[1].text;

        let recVal = evalExpr(rec, ctx)[0]["val"];
        evalLog("recVal", recVal);
        evalLog("recField", recField);
        let fieldVal = recVal.applyArg(new StringValue(recField));
        return [ctx.withVal(fieldVal)];
    }

    //
    // Evaluation of some built-in constants.
    //

    // The 'BOOLEAN' built-in constant representing the set of all boolean values.
    if (node.type === "boolean_set") {
        // console.log(node.type, node.text);
        let boolSet = [new BoolValue(true), new BoolValue(false)];
        return [ctx.withVal(new SetValue(boolSet))];
    }


    //
    // Evaluation of raw literal values.
    //

    if (node.type === "nat_number") {
        // console.log(node.type, node.text);
        return [ctx.withVal(new IntValue(parseInt(node.text)))];
    }

    if (node.type === "boolean") {
        evalLog(node.type, node.text);
        let boolVal = node.text === "TRUE" ? true : false;
        return [ctx.withVal(new BoolValue(boolVal))];
    }

    if (node.type === "string") {
        evalLog("string node", node.text);
        // Remove the quotes.
        let rawStr = node.text.substring(1, node.text.length - 1);
        return [ctx.withVal(new StringValue(rawStr))];
    }

    // TODO: Re-examine whether this implementation is correct.
    if (node.type === "finite_set_literal") {
        return evalFiniteSetLiteral(node, ctx);
    }

    // <<e1,e2,...,en>>
    if (node.type === "tuple_literal") {
        evalLog("tuple_literal", node);
        let elems = node.namedChildren.slice(1, node.namedChildren.length - 1);

        tupleVals = elems.map(el => evalExpr(el, ctx)[0]["val"]);
        return [ctx.withVal(new TupleValue(tupleVals))];
    }

    // [<identifier> |-> <expr>, <identifier> |-> <expr>, ...]
    // "|->" is of type 'all_map_to'.
    if (node.type === "record_literal") {
        evalLog("RECLIT", node);
        let record_obj = {};
        let recordDom = [];
        let recordVals = [];
        for (var i = 0; i < node.namedChildren.length; i += 3) {
            let ident = node.namedChildren[i]
            let exprNode = node.namedChildren[i + 2]

            let identName = ident.text;
            let exprVal = evalExpr(exprNode, ctx);
            record_obj[identName] = exprVal[0]["val"];
            recordDom.push(new StringValue(identName));
            recordVals.push(exprVal[0]["val"]);
        }
        let isRecord = true;
        let recVal = new FcnRcdValue(recordDom, recordVals, isRecord);
        evalLog("RECOBJ", recVal);
        return [ctx.withVal(recVal)];
    }


    // "[" <quantifier_bound> "|->" <expr> "]"
    if (node.type === "function_literal") {
        return evalFunctionLiteral(node, ctx);
    }
}

/**
 * Generates all possible initial states given the syntax tree node for the
 * initial state predicate and an object 'vars' which contains exactly the
 * specification's state variables as keys.
 */
function getInitStates(initDef, vars, defns, constvals) {
    // TODO: Pass this variable value as an argument to the evaluation functions.
    ASSIGN_PRIMED = false;
    depth = 0;

    // Values of each state variable. Initially empty.
    init_var_vals = {};
    for (v in vars) {
        init_var_vals[v] = null;
    }
    let emptyInitState = new TLAState(init_var_vals);

    // We refer to a 'context' as the context for a single evaluation
    // branch, which contains a computed value along with a list of 
    // generated states.
    let initCtx = new Context(null, emptyInitState, defns, {}, constvals);
    let ret_ctxs = evalExpr(initDef, initCtx);
    if (ret_ctxs === undefined) {
        console.error("Set of generated initial states is 'undefined'.");
    }
    console.log("Possible initial state assignments:");
    for (const ctx of ret_ctxs) {
        // console.log(ctx);
    }
    return ret_ctxs;
}

/**
 * Generates all possible successor states from a given state and the syntax
 * tree node for the definition of the next state predicate.
 */
function getNextStates(nextDef, currStateVars, defns, constvals) {
    // TODO: Pass this variable value as an argument to the evaluation functions.
    ASSIGN_PRIMED = true;
    depth = 0;
    let origVars = Object.keys(currStateVars.stateVars);

    for (var k in currStateVars.stateVars) {
        let primedVar = k + "'";
        currStateVars.stateVars[primedVar] = null;
    }
    evalLog("currStateVars:", currStateVars);

    let initCtx = new Context(null, currStateVars, defns, {}, constvals);
    // console.log("currStateVars:", currStateVars);
    let ret = evalExpr(nextDef, initCtx);
    evalLog("getNextStates eval ret:", ret);

    // Filter out disabled transitions.
    ret = ret.filter(c => c["val"].getVal() === true);

    evalLog("getNextStates filtered:", ret);

    // Only keep states where all primed variables were assigned.
    ret = ret.filter(c => _.every(origVars, v => c.state.getVarVal(v + "'") !== null));

    // Filter out transitions that do not modify the state.
    // let all_next_states = ret.filter(c => {
    //     return !_.every(origVars, (v) => c.state.getVarVal(v).fingerprint() === c.state.getVarVal(v+"'").fingerprint());
    // });

    let all_next_states = ret;

    // TODO: Check if we are correctly keeping only unique states.
    // all_next_states = _.uniqBy(all_next_states, c => c.state.fingerprint());

    // Keep only unique states, based on hashed fingerprint value.
    evalLog("getNextStates all:", all_next_states);
    return all_next_states;
}

class TlaInterpreter {

    computeInitStates(treeObjs, constvals) {
        let consts = treeObjs["const_decls"];
        let vars = treeObjs["var_decls"];
        let defns = treeObjs["op_defs"];
        Object.assign(defns, treeObjs["fn_defs"]); // include function definitions.

        console.log("consts:", consts);

        let initDef = defns["Init"];
        console.log("<<<<< INIT >>>>>");
        console.log(initDef);
        console.log("initDef.childCount: ", initDef["node"].childCount);
        console.log("initDef.type: ", initDef["node"].type);

        let initStates = getInitStates(initDef["node"], vars, defns, constvals);
        // Keep only the valid states.
        initStates = initStates.filter(actx => actx["val"].getVal()).map(actx => actx["state"]);
        return initStates;
    }

    computeNextStates(treeObjs, constvals, initStates) {
        let consts = treeObjs["const_decls"];
        let vars = treeObjs["var_decls"];
        let defns = treeObjs["op_defs"];

        let nextDef = defns["Next"];
        // console.log(defns);
        console.log("<<<< NEXT >>>>");
        // console.log(nextDef);
        // console.log("nextDef.childCount: ", nextDef["node"].childCount);
        // console.log("nextDef.type: ", nextDef["node"].type);

        let allNext = [];
        for (const istate of initStates) {
            let currState = _.cloneDeep(istate);
            // console.log("###### Computing next states from state: ", currState);
            let ret = getNextStates(nextDef["node"], currState, defns, constvals);
            allNext = allNext.concat(ret);
        }
        return allNext;
    }

    computeReachableStates(treeObjs, constvals) {
        let vars = treeObjs["var_decls"];
        let defns = treeObjs["op_defs"];

        let initDef = defns["Init"];
        let nextDef = defns["Next"];

        // Compute initial states and keep only the valid ones.
        // let initStates = getInitStates(initDef["node"], vars, defns, constvals);
        let initStates = this.computeInitStates(treeObjs, constvals);

        let initStatesOrig = _.cloneDeep(initStates);
        let stateQueue = initStates;
        let seenStatesHashSet = new Set();
        let reachableStates = [];
        let edges = [];
        while (stateQueue.length > 0) {
            console.log("initStatesOrig:", initStatesOrig);
            let currState = stateQueue.pop();
            // console.log(currState);
            let currStateHash = currState.fingerprint();
            console.log("curr state hash:", currStateHash);

            // If we've already seen this state, we don't need to explore it.
            if (seenStatesHashSet.has(currStateHash)) {
                console.log("already seen state " + currStateHash);
                continue;
            }

            // Mark the state as seen and record it as reachable.
            seenStatesHashSet.add(currStateHash);
            reachableStates.push(currState);

            // Compute next states reachable from the current state, and add
            // them to the state queue.
            let currStateArg = _.cloneDeep(currState);
            let nextStates = this.computeNextStates(treeObjs, constvals, [currStateArg])
                .map(c => c["state"].deprimeVars());
            console.log("nextStates:", nextStates);
            // console.log("reachableStates:", reachableStates);
            stateQueue = stateQueue.concat(nextStates);
            for (const nextSt of nextStates) {
                edges.push([currStateArg, nextSt])
            }
        }
        return {
            "initStates": initStatesOrig,
            "states": reachableStates,
            "edges": edges
        }
    }
}

//
// For debugging/tracing expression evaluation.
//

let parent = null;
let evalNodeGraph = [];

let origevalExpr = evalExpr;
evalExpr = function (...args) {
    depth += 1;

    // let ctx = args[1];
    // let currAssignedVars = _.keys(ctx["state"].vars).filter(k => ctx["state"].vars[k] !== null)
    // evalLog("curr assigned vars:", currAssignedVars);

    // Test out tracking of evaluation graph for debugging.
    let currNode = args[0];
    let edge = null;
    if (parent !== null) {
        // console.log("nodeedge:", "\"" + currNode.text + "\"", "->", "\"" + parent.text + "\"");
        edge = [currNode.text, parent.text]
        // evalNodeGraph.push([currNode.text, parent.text]);
    }

    let origParent = parent;
    parent = args[0];

    // Run the original function to evaluate the expression.
    let ret = origevalExpr(...args);
    evalLog("evalreturn -> ", ret, args[0].text);
    parent = origParent;

    if (edge !== null && enableEvalTracing) {
        evalNodeGraph.push([edge, ret]);
    }

    // evalLog("num ret ctxs: " , ret.length);
    // evalLog("evalreturn num ctxs: ", ret.length);

    // evalLog("evalreturn num ctxs: ", ret.length);

    // Evaluation DOT graph printing.
    if (enableEvalTracing) {
        // let Gstr = evalNodeGraph.map(e => "\"" + e[0] + "\"" + " -> " + "\"" + e[1] + "\"").join(";") + ";";
        // console.log(Gstr.replaceAll("\\", "\\\\"));
    }

    depth -= 1;
    return ret;
}

let origevalBoundInfix = evalBoundInfix;
evalBoundInfix = function (...args) {
    depth += 1;
    let ret = origevalBoundInfix(...args);
    evalLog("evalreturn -> ", ret);
    depth -= 1;
    return ret;
}

let origevalConjList = evalConjList;
evalConjList = function (...args) {
    depth += 1;
    let ret = origevalConjList(...args);
    evalLog("evalreturn -> ", ret);
    depth -= 1;
    return ret;
}

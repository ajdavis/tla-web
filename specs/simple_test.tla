----------------------- MODULE simple_test ------------------------
EXTENDS Naturals

VARIABLE x

Init == x = 0

Add(a,b) == a + b

Next == x' = Add(x,2)



=============================================================================
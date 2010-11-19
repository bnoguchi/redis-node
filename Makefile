  
VOWS = vows --spec

TESTS = test/*.vows.js

test:
	@$(VOWS) $(TESTS)

.PHONY: test

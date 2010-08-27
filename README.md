## redis-node - Complete Redis Client for Node.js
---

Blog post coming.

### Features include:
- Full transactional support (including nested transactions) (i.e., MULTI/EXEC) (to my knowledge, not present in [redis-node-client](http://github.com/fictorial/redis-node-client.git).
- Test coverage of nearly all the Redis commands.

### Dependencies
The Vows Testing Framework:
From git:
    git clone http://github.com/cloudhead/vows.git
Or from npm:
    npm install vows

### Installation
From git:
    git clone http://github.com/bnoguchi/redis-node.git
Npm installation coming...

### Example
See test/ for examples.

### Test Coverage
See [./test/](http://github.com/bnoguchi/redis-node) for the list of tests.
To run the tests from the command line.
    vows test/*.vows.js

### License
MIT License

---
### Author
Brian Noguchi

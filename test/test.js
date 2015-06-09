'use strict';
var Plugin = require('../index');
var Code = require('code');
var Hapi = require('hapi');
var Lab = require('lab');
// Test shortcuts
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var expect = Code.expect;

var authUtils = require('./utils/auth');

describe('Plugin', function () {
    it('should work', function (done) {
        var server = new Hapi.Server();
        var plugin = new Plugin();
        server.connection({host: 'localhost', port: 8080});

        server.auth.scheme('random', authUtils.testScheme);
        server.auth.strategy('default', 'random', false);

        server.auth.default('default');

        server.register(plugin, function (err) {
            expect(err).to.not.exist();
            expect(plugin._register).to.be.a.function();
            expect(plugin._register()).to.be.a.string();
            done();
        });
    });
});
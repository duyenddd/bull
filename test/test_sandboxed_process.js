/*eslint-env node */
'use strict';

var Promise = require('bluebird');
var expect = require('chai').expect;
var utils = require('./utils');
var redis = require('ioredis');
var _ = require('lodash');

describe('sandboxed process', function () {
  var queue;

  beforeEach(function(){
    var client = new redis();
    return client.flushdb().then(function(){
      queue = utils.buildQueue('test process', {settings: {
        guardInterval: Number.MAX_VALUE,
        stalledInterval: Number.MAX_VALUE
      }});
      return queue;
    });
  });

  afterEach(function(){
    return queue.close().then(function(){
      var client = new redis();
      return client.flushall();
    });
  });

  it('should process and complete', function (done) {
    queue.process(__dirname + '/fixtures/fixture_processor.js');

    queue.on('completed', function(job, value){
      try {
        expect(job.data).to.be.eql({foo:'bar'});
        expect(value).to.be.eql(42);
        expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
        expect(queue.childPool.free).to.have.lengthOf(1);
        done();
      } catch (err) {
        done(err);
      }
    });

    queue.add({foo:'bar'});
  });

  it('should process with named processor', function (done) {
    queue.process('foobar', __dirname + '/fixtures/fixture_processor.js');

    queue.on('completed', function(job, value){
      try {
        expect(job.data).to.be.eql({foo:'bar'});
        expect(value).to.be.eql(42);
        expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
        expect(queue.childPool.free).to.have.lengthOf(1);
        done();
      } catch (err) {
        done(err);
      }
    });

    queue.add('foobar', {foo:'bar'});
  });

  it('should process with concurrent processors', function (done) {
    var after = _.after(4, function(){
      expect(queue.childPool.free.length).to.eql(4);
      done();
    });
    queue.on('completed', function(job, value){
      try {
        expect(value).to.be.eql(42);
        expect(Object.keys(queue.childPool.retained).length + queue.childPool.free.length).to.eql(4);
        after();
      } catch (err) {
        done(err);
      }
    });

    Promise.all([
      queue.add({foo:'bar1'}),
      queue.add({foo:'bar2'}),
      queue.add({foo:'bar3'}),
      queue.add({foo:'bar4'})
    ]).then(function() {
      queue.process(4, __dirname + '/fixtures/fixture_processor_slow.js');      
    });
  });

  it('should process and complete using done', function (done) {
    queue.process(__dirname + '/fixtures/fixture_processor_callback.js');

    queue.on('completed', function(job, value){
      try {
        expect(job.data).to.be.eql({foo:'bar'});
        expect(value).to.be.eql(42);
        expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
        expect(queue.childPool.free).to.have.lengthOf(1);
        done();
      } catch (err) {
        done(err);
      }
    });

    queue.add({foo:'bar'});
  });

  it('should process and update progress', function (done) {
    queue.process(__dirname + '/fixtures/fixture_processor_progress.js');

    queue.on('completed', function(job, value){
      try {
        expect(job.data).to.be.eql({foo:'bar'});
        expect(value).to.be.eql(37);
        expect(job.progress()).to.be.eql(100);
        expect(progresses).to.be.eql([10, 27, 78, 100]);
        expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
        expect(queue.childPool.free).to.have.lengthOf(1);
        done();
      } catch (err) {
        done(err);
      }
    });

    var progresses = [];
    queue.on('progress', function(job, progress){
      progresses.push(progress);
    });

    queue.add({foo:'bar'});
  });

  it('should process and fail', function (done) {
    queue.process(__dirname + '/fixtures/fixture_processor_fail.js');

    queue.on('failed', function(job, err){
      try {
        expect(job.data).eql({foo:'bar'});
        expect(job.failedReason).eql('Manually failed processor');
        expect(err.message).eql('Manually failed processor');
        expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
        expect(queue.childPool.free).to.have.lengthOf(1);
        done();
      } catch (err) {
        done(err);
      }
    });

    queue.add({foo:'bar'});
  });

  it('should process and fail', function (done) {
    queue.process(__dirname + '/fixtures/fixture_processor_callback_fail.js');

    queue.on('failed', function(job, err){
      try {
        expect(job.data).eql({foo:'bar'});
        expect(job.failedReason).eql('Manually failed processor');
        expect(err.message).eql('Manually failed processor');
        expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
        expect(queue.childPool.free).to.have.lengthOf(1);
        done();
      } catch (err) {
        done(err);
      }
    });

    queue.add({foo:'bar'});
  });

  it('should remove exited process', function (done) {
    queue.process(__dirname + '/fixtures/fixture_processor_exit.js');

    queue.on('completed', function(){
      try {
        expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
        expect(queue.childPool.free).to.have.lengthOf(1);
        Promise.delay(500).then(function(){
          expect(Object.keys(queue.childPool.retained)).to.have.lengthOf(0);
          expect(queue.childPool.free).to.have.lengthOf(0);
        })
          .asCallback(done);
      } catch (err) {
        done(err);
      }
    });

    queue.add({foo:'bar'});
  });
});

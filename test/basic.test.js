'use strict'

var test = require('tap').test
var os = require('os')
var pino = require('../')
var sink = require('./helper').sink
var check = require('./helper').check

var pid = process.pid
var hostname = os.hostname()

function levelTest (name, level) {
  test(name + ' logs as ' + level, function (t) {
    t.plan(2)
    var instance = pino(sink(function (chunk, enc, cb) {
      check(t, chunk, level, 'hello world')
    }))

    instance.level = name
    instance[name]('hello world')
  })

  test('passing objects at level ' + name, function (t) {
    t.plan(2)
    var instance = pino(sink(function (chunk, enc, cb) {
      t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
      delete chunk.time
      t.deepEqual(chunk, {
        pid: pid,
        hostname: hostname,
        level: level,
        hello: 'world',
        v: 1
      })
    }))

    instance.level = name
    instance[name]({ hello: 'world' })
  })

  test('passing an object and a string at level ' + name, function (t) {
    t.plan(2)
    var instance = pino(sink(function (chunk, enc, cb) {
      t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
      delete chunk.time
      t.deepEqual(chunk, {
        pid: pid,
        hostname: hostname,
        level: level,
        msg: 'a string',
        hello: 'world',
        v: 1
      })
    }))

    instance.level = name
    instance[name]({ hello: 'world' }, 'a string')
  })

  test('formatting logs as ' + name, function (t) {
    t.plan(2)
    var instance = pino(sink(function (chunk, enc, cb) {
      check(t, chunk, level, 'hello 42')
    }))

    instance.level = name
    instance[name]('hello %d', 42)
  })

  test('passing error at level ' + name, function (t) {
    t.plan(2)
    var err = new Error('myerror')
    var instance = pino(sink(function (chunk, enc, cb) {
      t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
      delete chunk.time
      t.deepEqual(chunk, {
        pid: pid,
        hostname: hostname,
        level: level,
        type: 'Error',
        msg: err.message,
        stack: err.stack,
        v: 1
      })
      cb()
    }))

    instance.level = name
    instance[name](err)
  })

  test('passing error with a serializer at level ' + name, function (t) {
    t.plan(2)
    var err = new Error('myerror')
    var instance = pino({
      serializers: {
        err: pino.stdSerializers.err
      }
    }, sink(function (chunk, enc, cb) {
      t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
      delete chunk.time
      t.deepEqual(chunk, {
        pid: pid,
        hostname: hostname,
        level: level,
        err: {
          type: 'Error',
          message: err.message,
          stack: err.stack
        },
        v: 1
      })
      cb()
    }))

    instance.level = name
    instance[name]({ err: err })
  })

  test('child logger for level ' + name, function (t) {
    t.plan(2)
    var instance = pino(sink(function (chunk, enc, cb) {
      t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
      delete chunk.time
      t.deepEqual(chunk, {
        pid: pid,
        hostname: hostname,
        level: level,
        msg: 'hello world',
        hello: 'world',
        v: 1
      })
    }))

    instance.level = name
    var child = instance.child({
      hello: 'world'
    })
    child[name]('hello world')
  })
}

levelTest('fatal', 60)
levelTest('error', 50)
levelTest('warn', 40)
levelTest('info', 30)
levelTest('debug', 20)
levelTest('trace', 10)

test('serializers can return undefined to strip field', function (t) {
  t.plan(1)
  var instance = pino({
    serializers: {
      test: function (o) { return undefined }
    }
  }, sink(function (obj, enc, cb) {
    t.notOk('test' in obj)
    cb()
  }))

  instance.info({ test: 'sensitive info' })
})

test('does not explode with a circular ref', function (t) {
  var instance = pino(sink(function (chunk, enc, cb) {
    // nothing to check
    cb()
  }))
  var b = {}
  var a = {
    hello: b
  }
  b.a = a // circular ref
  instance.info(a)
  t.end()
})

test('explode with a circular ref with safe = false', function (t) {
  var instance = pino({ safe: false }, sink(function (chunk, enc, cb) {
    // nothing to check
    cb()
  }))
  var b = {}
  var a = {
    hello: b
  }
  b.a = a // circular ref
  t.throws(function () {
    instance.info(a)
  })
  t.end()
})

test('set the name', function (t) {
  t.plan(2)

  var instance = pino({
    name: 'hello'
  }, sink(function (chunk, enc, cb) {
    t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
    delete chunk.time
    t.deepEqual(chunk, {
      pid: pid,
      hostname: hostname,
      level: 60,
      name: 'hello',
      msg: 'this is fatal',
      v: 1
    })
    cb()
  }))

  instance.fatal('this is fatal')
})

test('set undefined properties', function (t) {
  t.plan(2)

  var instance = pino(sink(function (chunk, enc, cb) {
    t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
    delete chunk.time
    t.deepEqual(chunk, {
      pid: pid,
      hostname: hostname,
      level: 30,
      hello: 'world',
      v: 1
    })
    cb()
  }))

  instance.info({ hello: 'world', property: undefined })
})

test('set properties defined in the prototype chain', function (t) {
  t.plan(2)

  var instance = pino(sink(function (chunk, enc, cb) {
    t.ok(new Date(chunk.time) <= new Date(), 'time is greater than Date.now()')
    delete chunk.time
    t.deepEqual(chunk, {
      pid: pid,
      hostname: hostname,
      level: 30,
      hello: 'world',
      v: 1
    })
    cb()
  }))

  function MyObject () {
    this.hello = 'world'
  }

  MyObject.prototype.some = function () {}

  instance.info(new MyObject())
})

test('throw if creating child without bindings', function (t) {
  t.plan(1)

  var instance = pino(
    sink(function (chunk, enc, cb) {
      t.ok(Date.parse(chunk.time) <= new Date(), 'time is greater than Date.now()')
      t.end()
    }))

  t.throws(function () {
    instance.child()
  })
})

test('correctly escape msg strings', function (t) {
  t.plan(1)

  var instance = pino({
    name: 'hello'
  }, sink(function (chunk, enc, cb) {
    delete chunk.time
    t.deepEqual(chunk, {
      pid: pid,
      hostname: hostname,
      level: 60,
      name: 'hello',
      msg: 'this contains "',
      v: 1
    })
    cb()
  }))

  instance.fatal('this contains "')
})

test('correctly support node v4+ stderr', function (t) {
  t.plan(1)

  // stderr inherits from Stream, rather than Writable
  var dest = {
    writable: true,
    write: function (chunk) {
      chunk = JSON.parse(chunk)
      delete chunk.time
      t.deepEqual(chunk, {
        pid: pid,
        hostname: hostname,
        level: 60,
        msg: 'a message',
        v: 1
      })
    }
  }

  var instance = pino(dest)

  instance.fatal('a message')
})

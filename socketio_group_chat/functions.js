/*
  Copyright (C) 2017 - 2020 MWSOFT
  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.
  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/* jshint esnext: true */
var fs = require('fs')
var path = require('path')

/**
 * General purpose data encoding
 *
 * (string): string
 */
function encode (data) {
  return (new Buffer(data)).toString('base64')
}

/**
 * Inverse of `encode`
 *
 * (string): string
 */
function decode (data) {
  return (new Buffer('' + data, 'base64')).toString('utf8')
}

/**
 * Encode a superhero name
 *
 * (string): string
*/
module.exports.encodeName = function (name) {
  return encode('@' + name)
}

/**
 * Load the database
 *
 * (string, (?Error, ?Object))
 */
module.exports.loadDb = function (dbFile, cb) {
  fs.readFile(dbFile, function (err, res) {
    if (err) { return cb(err) }

    var messages
    try {
      messages = JSON.parse(res)
    } catch (e) {
      return cb(err)
    }

    return cb(null, { file: dbFile, messages: messages })
  })
}

/**
 * Find the user's inbox, given their encoded username
 *
 * (Object, string): Object
 */
module.exports.findInbox = function (db, encodedName) {
  var messages = db.messages
  return {
    dir: path.dirname(db.file),
    messages: Object.keys(messages).reduce(function (acc, key) {
      if (messages[key].to === encodedName) {
        return acc.concat({
          hash: key,
          lastHash: messages[key].last,
          from: messages[key].from
        })
      } else { return acc }
    }, [])
  }
}

/**
 * Find the next message, given the hash of the previous message
 *
 * ({ messages: Array<Object> }, string): string
 */
module.exports.findNextMessage = function (inbox, lastHash) {
  // find the message which comes after lastHash
  var found
  for (var i = 0; i < inbox.messages.length; i += 1) {
    if (inbox.messages[i].lastHash === lastHash) {
      found = i
      break
    }
  }
    
    console.log(''+(path.join(inbox.dir, inbox.messages[found].hash)))
    
    fs.readFile(path.join(inbox.dir, inbox.messages[found].hash), 'utf8', function (err,data) {
      if (err) {
        return console.log(err);
      }
      console.log(decode(data));
    });
    
  // read and decode the message
  return 'from: ' + decode(inbox.messages[found].from) + '\n---\n' +
    decode(fs.readFile(path.join(inbox.dir, inbox.messages[found].hash), 'utf8'))
}
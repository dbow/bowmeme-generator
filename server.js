var fs = require('fs');

var express = require('express');
var gm = require('gm');

var app = express();

var bowmeme = gm('dbow.png');

app.get('/', function(req, res) {
  // TODO(dbow): Dynamically get base image.
  var baseImage = fs.createReadStream('chilltank.png');

  gm(baseImage)
    .size({bufferStream: true}, function(err, size) {
      var self = this;

      var resizedBowmeme = 'temp_' + Math.random();

      // Resize bowmeme to fit baseImage.
      bowmeme
        .resize(size.width, size.height)
        .write(resizedBowmeme, function(err) {

          // Composite resized bowmeme
          self.composite(resizedBowmeme)
          self.toBuffer('PNG', function(err, buffer) {

            // Delete temp resized bowmeme.
            fs.unlink(resizedBowmeme);

            // Return composited image.
            res.setHeader('content-type', 'image/png');
            res.end(buffer);
          })
        });
    });
});


var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});


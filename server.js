var fs = require('fs');
var http = require('http');
var https = require('https');
var url = require('url');

var express = require('express');
var gm = require('gm');
var validUrl = require('valid-url');
var giphyApi = require('giphy-api');

var app = express();
var giphy = giphyApi();

var bowmeme = gm('dbow.png');


function getBaseImageUrl(req, res, next) {
  if (validUrl.isUri(req.query.u)) {
    req.baseImageUrl = req.query.u;
    return next();
  }

  giphy.search({
      q: req.query.u,
      limit: 1
  }, function(err, res) {
    if (res.data.length) {
      req.baseImageUrl = res.data[0].images.original.url;
    } else {
      req.baseImageUrl = 'http://i.giphy.com/tpwwhv1BLd31e.gif';
    }
    next();
  });
}

function getImage(req, res, next) {
  var imageUrl = url.parse(req.baseImageUrl);
  var request = imageUrl.protocol === 'https:' ? https.request : http.request;
  var imageRequest = request(imageUrl, function(imageResponse) {
    var baseImage = 'base_' + Math.random();
    var stream = fs.createWriteStream(baseImage);
    imageResponse.pipe(stream);
    imageResponse.on('end', function() {
      req.baseImage = baseImage;
      next();
    });
  });
  imageRequest.on('error', function(e) {
    // TODO(dbow): Handle errors.
  });
  imageRequest.end();
}

function composite(req, res, next) {
  var baseImage = fs.createReadStream(req.baseImage);

  gm(baseImage)
    .identify({bufferStream: true}, function (err, data) {
      if (err) {
        return res.send('Something went horribly wrong!:' + err.message);
      }

      var self = this;

      var width = data.size.width;
      var height = data.size.height;

      req.format = data.format;

      var resizedBowmeme = 'temp_' + Math.random();

      // Resize bowmeme to fit baseImage.
      bowmeme
        .resize(width, height)
        .write(resizedBowmeme, function(err) {
          gm(resizedBowmeme)
            .size(function(err, size) {

              var bWidth = size.width / 2;
              var bHeight = size.height / 2;

              var compositeString = [
                'image over ',
                width - bWidth,
                ',',
                height - bHeight,
                ' ',
                bWidth,
                ',',
                bHeight,
                ' ',
                resizedBowmeme
              ];

              // Composite resized bowmeme
              self
                .command('convert')
                .in('-coalesce')
                .out('-resize', [width, 'x', height].join(''))
                .out('-draw', compositeString.join(''))
                .toBuffer(function(err, buffer) {
                  req.composite = buffer;
                  fs.unlink(resizedBowmeme);
                  fs.unlink(req.baseImage);
                  next();
                });
            });
        });
    });
}

app.get('/', getBaseImageUrl, getImage, composite, function(req, res) {
  res.setHeader('content-type', 'image/' + (req.format || 'png'));
  res.end(req.composite);
});

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});


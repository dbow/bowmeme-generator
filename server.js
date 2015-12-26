var fs = require('fs');
var http = require('http');
var https = require('https');
var url = require('url');

var express = require('express');
var gm = require('gm');
var validUrl = require('valid-url');
var giphyApi = require('giphy-api');
var winston = require('winston');
var _ = require('lodash');

var app = express();
var giphy = giphyApi();

var bowmeme = gm('dbow.png');

var DEFAULT_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons' +
                    '/3/3b/Windows_9X_BSOD.png';

winston.add(winston.transports.File, { filename: 'bowmeme.log' });
// winston.remove(winston.transports.Console);

function error(err) {
  winston.log('error', err.message);
  return 'Something went horribly wrong!:' + err.message;
}

function getBaseImageUrl(req, res, next) {
  if (validUrl.isUri(req.query.u)) {
    winston.log('info', req.query.u, { type: 'url' });

    req.baseImageUrl = req.query.u;
    return next();
  }

  winston.log('info', req.query.u, { type: 'query' });

  giphy.search({
      q: req.query.u,
      limit: 1
  }, function(err, res) {
    if (err) {
      return res.send(error(err));
    }
    if (res.data && res.data.length) {
      req.baseImageUrl = _.get(res.data[0], 'images.original.url', DEFAULT_IMAGE);
    } else {
      req.baseImageUrl = DEFAULT_IMAGE;
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
  imageRequest.on('error', function(err) {
    return res.send(error(err));
  });
  imageRequest.end();
}

function composite(req, res, next) {
  var baseImage = fs.createReadStream(req.baseImage);

  gm(baseImage)
    .identify({bufferStream: true}, function (err, data) {
      if (err) {
        return res.send(error(err));
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
          if (err) {
            return res.send(error(err));
          }
          gm(resizedBowmeme)
            .size(function(err, size) {
              if (err) {
                return res.send(error(err));
              }

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
                  if (err) {
                    return res.send(error(err));
                  }
                  req.composite = buffer;
                  fs.unlink(resizedBowmeme);
                  fs.unlink(req.baseImage);
                  next();
                });
            });
        });
    });
}

app.get('/logs', function(req, res) {
  winston.query({limit: 100}, function (err, results) {
    if (err) {
      return res.send(err.message);
    }
    console.log(results);
    res.setHeader('content-type', 'application/json');
    res.send(results);
  });
});

app.get('/', getBaseImageUrl, getImage, composite, function(req, res) {
  res.setHeader('content-type', 'image/' + (req.format || 'png'));
  res.end(req.composite);
});

var server = app.listen(process.env.PORT || 3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});


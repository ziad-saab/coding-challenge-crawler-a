var request = require('request'),
  cheerio = require('cheerio'),
  moment = require('moment'),
  util = require('util'),
  async = require('async');

var REQUEST_CONCURRENCY = 5;

var ALL_STOPS_URL = 'http://coach.nationalexpress.com/nxbooking/ajax-map-locations.action?zl=6&neLat=58.13415046188963&neLng=5.93212890625&swLat=50.511293812249455&swLng=-9.93212890625&prox=50&viewPortX=597&viewPortY=722';
var LOCATION_ID_MAP_URL = 'http://www.nationalexpress.com/coach/locationsearch/FromLocationId.aspx';

/*
Given a stop object, use its name to find the ID thru the site's autocompleter
The response from the autocompleter is an ID followed by whitespace and some HTML
*/
function getStopWithId(stop, callback) {
  request({
    uri: LOCATION_ID_MAP_URL,
    qs: {
      q: stop.stop_name
    }
  }, function(err, response, body) {
    if (err || response.statusCode != 200) {
      callback(err || true);
    }
    else {
      stop.id = body.trim().split(/\s+/)[0];
      console.log(stop.stop_name + ' : ' + stop.id);
      callback(null, stop);
    }
  })
}

/*
Extract all stops from the site by loading the initial ajax call from the UI (presumably contains all stops)
There are two types of stops: single and multiple. We group them all together and get their id, then return them
 */
function extractStops(callback) {
  console.log('Extracting all stops...');
  request(ALL_STOPS_URL, function(err, response, body) {
    if (err || response.statusCode != 200) {
      callback (err || 'error');
    }
    
    var locations = JSON.parse(body).locations;
    var numLocations = locations.length;
    var stops = [], location, point, numPoints;
    for (var i = 0; i < numLocations; i++) {
      location = locations[i];
      // multiple stops
      if (location.points && (numPoints = location.points.length) > 0) {
        for (var j = 0; j < numPoints; j++) {
          point = location.points[j];
          stops.push({
            stop_name: point.name,
            stop_location: point.address,
            lat: point.lat,
            long: point.lng
          });
          console.log('New stop found: ' + point.name);
        }
      }
      // single stop
      else {
        stops.push({
          stop_name: location.title,
          stop_location: location.address,
          lat: location.latitude,
          long: location.longitude
        });
        console.log('New stop found: ' + location.title);
      }
    }
    // get all IDs of stops
    console.log('Getting IDs for all stops...');
    async.parallelLimit(stops.map(function(stop){
      return function(cb) {getStopWithId(stop, cb);}
    }), REQUEST_CONCURRENCY, callback);
  });
}

module.exports = {
  extractStops: extractStops
};
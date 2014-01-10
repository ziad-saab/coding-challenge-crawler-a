var request = require('request'),
  cheerio = require('cheerio'),
  moment = require('moment'),
  util = require('util'),
  async = require('async');

var REQUEST_CONCURRENCY = 5;

// Stop URLs
var ALL_STOPS_URL = 'http://coach.nationalexpress.com/nxbooking/ajax-map-locations.action?zl=6&neLat=58.13415046188963&neLng=5.93212890625&swLat=50.511293812249455&swLng=-9.93212890625&prox=50&viewPortX=597&viewPortY=722';
var LOCATION_ID_MAP_URL = 'http://www.nationalexpress.com/coach/locationsearch/FromLocationId.aspx';

// Departures URLs
var DEPARTURE_STEP1_URL = 'http://www.nationalexpress.com/journeyrequest/index.cfm';
/**
 * Given a stop object, use its name to find the ID thru the site's autocompleter
 * The response from the autocompleter is an ID followed by whitespace and some HTML
 *
 * @param stop object Must contain at least the stop_name property
 * @param callback
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

/**
 * Extract all stops from the site by loading the initial ajax call from the UI (presumably contains all stops)
 * There are two types of stops: single and multiple. We group them all together and get their id, then return them
 *
 * @param callback
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

/**
 * Get all departures with prices for a given date. 
 * 
 * STEP 1:
 * Submit the "accessible" form on the home page with the inputs given
 * 
 * STEP 2:
 * When redirected to the departures list, crawl the departures table, register each departure/arrival times and the corresponding value of the radio box for selecting that departure.
 * 
 * STEP 3:
 * For each departure/arrival, submit the form in step 2 with 1 adult selected
 * 
 * @param origin object stop with at least id property
 * @param destination object stop with at least id property
 * @param date string YYYY-MM-DD
 * @param callback
 */
function getDeparturesForRoute(origin, destination, date, callback) {
  var splitDate = date.split('-');
  request({
    url: DEPARTURE_STEP1_URL,
    method: 'POST',
    followAllRedirects: true,
    form: {
      referer: '/home.aspx',
      marker: 1,
      jptype: 'all',
      adult: 1,
      fromc: origin.id,
      toc: destination.id,
      oy: splitDate[0],
      om: splitDate[1],
      od: splitDate[2],
      ochoice: 'all',
      jt: 'S'
    }
  }, function(err, response, body) {
    // First check if the site is in maintenance...
    if (body.indexOf('We are sorry for any inconvenience caused as a result of routine maintenance') >= 0) {
      callback('SITE IN MAINTENANCE, SCRAPING STOPPED');
      return;
    }
    
    var step2Url = 'http://www.nationalexpress.com' + response.request.path;
    var $ = cheerio.load(body);
    // Find all rows that correspond to a departure
    var departureRows = $('.pickme');
    if (departureRows.length == 0) {
      // If none, then we're out
      callback(null, {});
    }
    else {
      // Go thru all the departures, note the times, duration, and queue another request for the one-way one-adult price

      var tasks = [];
      departureRows.each(function() {
        var depRow = $(this);
        var dep = {
          origin_stop: origin.stop_name,
          destination_stop: destination.stop_name,
          departure_time: depRow.find('[headers=outward_departs]').text(),
          arrival_time: depRow.find('[headers=outward_arrive]').text(),
          duration: depRow.find('[headers=outward_duration]').html().replace(/<br>/gi, ', ')
        };
        var key = depRow.find('input[name=oj]').attr('value');
        tasks.push(getDepartureWithPrice.bind(null, dep, key, step2Url));
      });
      async.parallelLimit(tasks, REQUEST_CONCURRENCY, callback);
    }
  });
}

/**
 * Internal function to get the price for  a specific departure, submits step 2's form with 1 adult selected
 * @param departure object Departure object without price
 * @param departureKey string Key from departure row's radio button value
 * @param step2Url string The unique URL for step 2
 * @param callback
 */
function getDepartureWithPrice(departure, departureKey, step2Url, callback) {
  request({
    url: step2Url,
    method: 'POST',
    followAllRedirects: true,
    form: {
      marker: 1,
      oj: departureKey,
      uk_ad: 1
    }
  }, function(err, response, body) {
    var $ = cheerio.load(body);
    departure.price = $('#farenoins1').text();
    callback(null, departure);
  });
}

/**
 *
 * @param stops array Array of stops with at least property ID
 * @param startDate The start date YYYY-MM-DD
 * @param endDate The end date YYYY-MM-DD
 * @param callback
 */
function extractDepartures(stops, startDate, endDate, callback) {
  // Build date range
  startDate = moment(startDate, 'YYYY-MM-DD').startOf('day');
  endDate = moment(endDate, 'YYYY-MM-DD').startOf('day');
  var dates = [];
  for (var i = startDate; i.isBefore(endDate) || i.isSame(endDate); i = i.add(1, 'days')) {
    dates.push(i.format('YYYY-MM-DD'));
  }

  // Add one item to the queue for each origin/destination/date tuple
  var tasks = {}, key;
  stops.forEach(function(origin) {
    stops.forEach(function(destination) {
      dates.forEach(function(date) {
        if (origin.id != destination.id) {
          key = origin.id + '|' + destination.id + '|' + date;
          tasks[key] = function(cb) {getDeparturesForRoute(origin, destination, date, cb)};
        }
      });
    });
  });
  // Get all departures
  async.parallelLimit(tasks, 1, callback);
}

module.exports = {
  extractStops: extractStops,
  extractDepartures: extractDepartures
};
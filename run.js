var moment = require('moment'),
  crawler = require('./crawler'),
  fs = require('fs');

var args = require('optimist')
  .usage('Usage: $0 --extract stops|departures --output outfile.json [--startdate YYYY-MM-DD [--enddate YYYY-MM-DD]]')
  .demand(['extract', 'output'])
  .describe({
    extract: 'The type of extraction to perform',
    output: 'The path of the output file to generate',
    startdate: 'The beginning of the departure date range',
    enddate: 'The end of the departure date range'
  })
  .check(function(args) {
    if (['stops','departures'].indexOf(args.extract) < 0) {
      throw new Error('extract must be one of [stops,departures]');
    }
    
    var dateExp = /\d{4}-\d{2}-\d{2}/;
    if (args.startdate && !dateExp.test(args.startdate)) {
      throw new Error('startdate must be YYYY-MM-DD');
    }
    if (args.enddate && !dateExp.test(args.enddate)) {
      throw new Error('enddate must be YYYY-MM-DD');
    }
  })
  .argv;

if (args.extract == 'stops') {
  crawler.extractStops(function(err, res) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    else {
      var content = JSON.stringify(res, null, 4);
      fs.writeFile(args.output, content, function(err, res) {
        if (err) {
          console.error(err);
          process.exit(1);
        }
      });
    }
  });
}
else {
  // TODO extract departures
  console.error('Not implemented yet');
  process.exit(1);
}
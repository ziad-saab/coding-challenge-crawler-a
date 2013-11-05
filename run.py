#!/usr/local/bin/python
# -*- coding: utf-8

# Requires Python 2.7
import argparse
import datetime

##
# Parse a date string
#
# @param s the string representation of the date, using the YYYY-MM-DD format
#
def parse_date(s):
    return datetime.strptime(s, '%Y-%m-%d')

##
# Get today's date, with an optional offset
#
# @param offset the number of days to offset from today
#
def today(offset=0):
    return datetime.date.today() + datetime.timedelta(offset)

parser = argparse.ArgumentParser(description='Crawl web site.')
parser.add_argument('--extract',   required=True,  choices=['stops', 'departures'], help='the type of extraction to perform')
parser.add_argument('--output',    required=True,  type=argparse.FileType('w'),     help='the path of the output file to generate')
parser.add_argument('--startdate', required=False, type=parse_date, default=today(), help='the beginning of the departure date range')
parser.add_argument('--enddate',   required=False, type=parse_date, default=today(7), help='the end of the departure date range')

args = parser.parse_args()

if args.extract == 'stops':
    print 'downloading stops to %s' % args.output
    exit(0)

elif args.extract == 'departures':
    print 'downloading departures to %s for dates %s through %s' % (args.output, args.startdate, args.enddate)
    exit(0)

else:
    print 'invalid arguments, check inputs'
    exit(-1)
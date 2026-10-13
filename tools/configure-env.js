#!/usr/bin/env node
'use strict';



var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var envPath = path.join(root, '.env');
var configPath = path.join(root, 'config.js');

function parseEnv(text) {
  var values = {};
  text.split(/\r?\n/).forEach(function (line) {
    var match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].indexOf('#') === 0) return;
    var value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    values[match[1]] = value;
  });
  return values;
}

function fail(message) {
  console.error('[BLITZ] ' + message);
  process.exitCode = 1;
}

if (!fs.existsSync(envPath)) {
  fail('.env was not found. Copy .env.example to .env and fill in the public Supabase values.');
} else {
  var env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  var url = String(env.SUPABASE_URL || '').trim();
  var key = String(env.SUPABASE_ANON_KEY || '').trim();

  if (!/^https:\/\/[^\/\s]+$/i.test(url)) {
    fail('SUPABASE_URL must be an HTTPS Supabase project URL.');
  } else if (key.length < 20 || /service_role|secret/i.test(key)) {
    fail('SUPABASE_ANON_KEY must be the public anon/publishable key, not a secret key.');
  } else {
    var config = [
      '',
      'window.BLITZ_CONFIG = {',
      "  supabaseUrl: '" + url.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "',",
      "  supabaseKey: '" + key.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'",
      '};',
      ''
    ].join('\n');
    fs.writeFileSync(configPath, config, 'utf8');
    console.log('[BLITZ] config.js updated from .env');
  }
}

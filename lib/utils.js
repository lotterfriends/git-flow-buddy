#!/usr/bin/env node

var when = require('when');
var fs = require('fs');
var path = require('path');
var sh = require('shelljs');
var exec = require('child_process').exec;

module.exports.bump = function(currentVersion, newVersion) {

  if (newVersion === 'major') {
    var majorNumber = parseInt(currentVersion.replace(/(\d*)\.\d*\.\d*.*/, '$1'), 10);
    newVersion = currentVersion.replace(/(\d*)(\.\d*\.\d*.*)/, (majorNumber + 1) + '.0.0');
  }

  if (newVersion === 'minor') {
    var minorNumber = parseInt(currentVersion.replace(/\d*\.(\d*)\.\d*.*/, '$1'), 10);
    newVersion = currentVersion.replace(/(\d*\.)\d*(\.\d*.*)/, '$1' + (minorNumber + 1) + '.0');
  }

  if (newVersion === 'patch') {
    var patchNumber = parseInt(currentVersion.replace(/\d*\.\d*\.(\d*).*/, '$1'), 10);
    newVersion = currentVersion.replace(/(\d*\.\d*\.)(\d*)(.*)/, '$1' + (patchNumber + 1));
  }

  return newVersion;
};

module.exports.extend = function(target) {
  var sources = [].slice.call(arguments, 1);
  sources.forEach(function (source) {
    for (var prop in source) {
      target[prop] = source[prop];
    }
  });
  return target;
};

module.exports.updatePackageFile = function(packageDefinitionPath, newVersion, buildTimestamp, spaces) {
  spaces = spaces || 2;
  return when.promise(function(resolve, reject) {
    fs.readFile(packageDefinitionPath, "utf8", function (err, fileContent) {
      if (err) {
        reject('an error occured during reading the package file');
      } else {
        var addFinalNewLine = module.exports.detectNewline(fileContent) ? true : false;
        var currentPackage = require(packageDefinitionPath);
        currentPackage.version = newVersion;
        if (buildTimestamp && buildTimestamp !== false) {
          currentPackage.buildTimestamp = buildTimestamp;
        }
        var outputFilename = path.basename(packageDefinitionPath);
        var content = JSON.stringify(currentPackage, null, spaces);
        if (addFinalNewLine) {
          content += '\n';
        }
        fs.writeFile(outputFilename, content, function(error) {
          if (error) {
            reject('an error occured during saving the package file');
          } else {
            resolve();
          }
        });
      }
    });
  });
};

module.exports.updatePackageLock = () => {
  var file = path.join(process.cwd(), 'package-lock.json');
  return when.promise(function(resolve, reject) {
    if (sh.test('-f', file)) {
      exec('npm i --package-lock-only --ignore-scripts', function(error) {
        if (error != null) {
          reject(error);
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

module.exports.detectNewline = function (str) {
  if (typeof str !== 'string') {
    throw new TypeError('Expected a string');
  }

  var newlines = (str.match(/(?:\r?\n)/g) || []);

  if (newlines.length === 0) {
    return null;
  }

  var crlf = newlines.filter(function (el) {
    return el === '\r\n';
  }).length;

  var lf = newlines.length - crlf;

  return crlf > lf ? '\r\n' : '\n';
};

module.exports.getPackage = function(execPath) {
  var packageFiles = ['package.json', 'composer.json'];
  var packageFile = false;
  packageFiles.forEach(function(package) {
    var file = path.join(execPath, package);
    if (sh.test('-f', file)) {
      packageFile = file;
      return false;
    }
  });
  return packageFile;
}

module.exports.isFileReadable = function(file) {
  return sh.test('-f', file);
};

module.exports.isDefined = function(value) {
  return typeof value !== 'undefined';
};

module.exports.resolveParam = function(param, defaultValue) {
  return module.exports.isDefined(param) ? param : defaultValue;
};

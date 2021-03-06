#!/usr/bin/env node

// node
var path = require('path');

// lib
var chalk = require('chalk');
var semver = require('semver');

// dependencies
var Helper = require('../lib');
var git = require('../lib/git');
var _ = require('../lib/utils');
var changelog = require('../lib/changelog');

// vars
var parameterVersion = false;
var paramaters = [];
var project = {};
var options = {};
var cleanup = false;
var reset = false;
var showChanges = false;
var bump = false;
var finish = false;
var disableRollback = false;

var getProject = function() {
  options.packageDefinitionPath = _.getPackage(process.cwd());
  if (options.packageDefinitionPath) {
    project = require(options.packageDefinitionPath);
  } else {
    console.log(chalk.yellow('no project file (package.json or composer.json), testing for tags'))
    var version = git.getLastTagSync();
    var prefix = git.getVersionPrefixSync();
    version = version.replace(prefix, '');
    if (semver.valid(version)) {
      project.version = version;
      project.status = false;
      project.name = path.basename(process.cwd());
    } else {
      console.log(chalk.red('no valid tags found'));
      process.exit(1);
    }
  }
};

var initOptions = function() {
  var configFilePath = path.join(process.cwd(), 'gfb-config.json');
  var config = _.isFileReadable(configFilePath) ? require(configFilePath) : {};
  _.extend(options, {
    push: _.resolveParam(config.push, false),
    keep: _.resolveParam(config.keep, false),
    update: _.resolveParam(config.update, false),
    debug: _.resolveParam(config.debug, false),
    buildTimestampInName: _.resolveParam(config.buildTimestampInName, false),
    createChangelog: _.resolveParam(config.createChangelog, true),
    changelogFolder: _.resolveParam(config.changelogFolder, './changelogs'),
    commitURL: _.resolveParam(config.commitURL, false),
    releaseURL: _.resolveParam(config.releaseURL, false),
    packageSpaces: _.resolveParam(config.packageSpaces, 2),
    preConditionCommands: _.resolveParam(config.preConditionCommands, []),
    neverendingChangelog: _.resolveParam(config.neverendingChangelog, false),
    neverendingChangelogFilename: _.resolveParam(config.neverendingChangelogFilename, 'CHANGELOG.md'),
    customReleaseCommands: _.resolveParam(config.customReleaseCommands, []),
    postReleaseCommands: _.resolveParam(config.postReleaseCommands, []),
    postReleaseFinishedCommands: _.resolveParam(config.postReleaseFinishedCommands, []),
    customReleaseFinishCommands: _.resolveParam(config.customReleaseFinishCommands, []),
    changelogUsername: _.resolveParam(config.changelogUsername, 'auto'),
    finishRelease: _.resolveParam(config.finishRelease, true),
    releaseMessagePrefix: _.resolveParam(config.releaseMessagePrefix, 'new Release'),
    disableRollback: _.resolveParam(config.disableRollback, false),
  });
};

var showHelp = function() {
  console.log();
  console.log('git-flow-buddy (gfb)');
  console.log();
  console.log('create a new release, update the version and build number and do the git stuff');
  console.log('gfb 0.0.5');
  console.log('gfb major|minor|patch');
  console.log('gfb -p minor');
  console.log('gfb --debug -p patch')
  console.log('gfb -f 0.6.1')
  console.log();
  console.log('Usage: gfb');
  console.log();
  console.log('  options');
  console.log('   -h/--help              show this help');
  console.log('   -p/--push              push new release to origin');
  console.log('   -k/--keep              keep branch after performing finish');
  console.log('   -d/--debug             more output');
  console.log('   -u/--update            update the last release (experimental)');
  console.log('   -b/--bump              just bump the version, nothing else');
  console.log('   -f/--finish            finish a previously created release branch (useful if finishRelease is set to false)');
  console.log('   -r/--disable-roolback  disable rollback on release fail');
  console.log('   --cleanup              remove an unfinished release');
  console.log('   --reset                reset repo with origin');
  console.log('   --changes              show changes since last version');
  console.log();
};

var handleParameters = function() {
  if (process.argv.length > 2) {
    paramaters = process.argv.splice(2);
    paramaters.forEach(function (parameter) {
      switch (parameter) {
        case '-h':
        case '--help':
          showHelp();
          process.exit(0);
          break;
        case '-d':
        case '--debug':
          options.debug = true;
          break;
        case '-p':
        case '--push':
          options.push = true;
          break;
        case '-k':
        case '--keep':
          options.keep = true;
          break;
        case '-u':
        case '--update':
          options.update = true;
          break;
        case '--cleanup':
          cleanup = true;
          options.update = true;
          break;
        case '--reset':
          reset = true;
          break;
        case '--changes':
          showChanges = true;
          break;
        case '-b':
        case '--bump':
          bump = true;
          break;
        case '-f':
        case '--finish':
          finish = true;
          break;
        case '-r':
        case '--disable-roolback':
          disableRollback = true;
          break;
      }
    });
  } else {
    showHelp();
    process.exit(1);
  }
};

var getVersion = function() {
  if (options.update) {
    parameterVersion = project.version;
    if (options.packageDefinitionPath) {
      console.log('version ' + parameterVersion + ' taken from package file ' + options.packageDefinitionPath);
    } else {
      console.log('version ' + parameterVersion + ' taken from tags');
    }
  } else {
    parameterVersion = paramaters[paramaters.length - 1];
    if (parameterVersion.indexOf('.') > -1) {
      parameterVersion = semver.clean(parameterVersion);
    }
    if (semver.valid(parameterVersion) === null && parameterVersion !== 'patch' && parameterVersion !== 'major' && parameterVersion !== 'minor') {
      console.log(chalk.red('invalid version parameter'));
      process.exit(1);
    }
  }

  if (typeof parameterVersion === 'undefined') {
    showHelp();
    process.exit(1);
  }
};

var doRelease = function() {
  var helper = new Helper(_.extend({}, options, {
    currentVersion: project.version,
    packageStatus: project.status,
    packageName: project.name
  }));
  helper.bump(parameterVersion);
  helper.setBranchName();
  helper.release();
};

var doCleanup = function() {
  var helper = new Helper(_.extend({}, options, {
    currentVersion: project.version,
    packageStatus: project.status,
    packageName: project.name
  }));
  helper.rollback();
};

var doReset = function() {
  var prefix = git.getVersionPrefixSync();
  git.deleteTag(prefix + project.version, true)
    .then(git.resetBranchWithOrigin.bind(this, 'develop'))
    .then(git.resetBranchWithOrigin.bind(this, 'master'))
    .then(git.checkoutDevelop.bind(this))
    .then(git.fetchTags.bind(this))
    .then(function() {
      console.log('reset finished');
  }, function(error) {
    console.log(chalk.red(error));
  });
}

var doFinish = function() {
  var helper = new Helper(_.extend({}, options, {
    currentVersion: project.version,
    packageStatus: project.status,
    packageName: project.name
  }));
  helper.newVersion = parameterVersion;
  helper.setBranchName();
  helper.finish();
}

getProject();
initOptions();
handleParameters();

if (!showChanges) {
  getVersion();
}

if (showChanges) {
  changelog.getUser({changelogUsername: 'auto'}).then(user => {
    console.log(`Username: ${user}`)
  });
  changelog.createReleaseMessage().then(function(message) {
    console.log(message);
  });
} else if (bump) {
  var helper = new Helper(_.extend({}, options, {
    currentVersion: project.version,
    packageStatus: project.status,
    packageName: project.name
  }));
  helper.bump(parameterVersion);
  helper.updatePackage(false);
  if (_.hasPackageLock()) {
    helper.updatePackageLock();
  }
} else if(finish) {
  doFinish();
} else if (reset) {
  doReset();
} else if (cleanup) {
  doCleanup();
} else {
  doRelease();
}



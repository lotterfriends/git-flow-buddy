
var bump = require('./utils').bump;
var updatePackageFile = require('./utils').updatePackageFile;
var updatePackageLock = require('./utils').updatePackageLock;
var hasPackageLock = require('./utils').hasPackageLock;

var git = require('./git');

var createChangelog = require('./changelog').createChangelog;
var createReleaseMessage = require('./changelog').createReleaseMessage;

var when = require('when');
var pipeline = require('when/pipeline');
var sh = require('shelljs');
var chalk = require('chalk');
var exec = require('child_process').exec;
var path = require('path');
var doRollBack = false;


function Release(options) {
  this.options = {
    preConditionCommands: options.preConditionCommands,
    createChangelog: options.createChangelog,
    keep: options.keep,
    update: options.update,
    push: options.push,
    packageDefinitionPath: options.packageDefinitionPath,
    commitURL: options.commitURL,
    packageSpaces: options.packageSpaces,
    changelogFolder: options.changelogFolder,
    debug: options.debug,
    buildTimestampInName: options.buildTimestampInName,
    releaseURL: options.releaseURL,
    neverendingChangelog: options.neverendingChangelog,
    neverendingChangelogFilename: options.neverendingChangelogFilename,
    packageStatus: options.packageStatus,
    packageName: options.packageName,
    customReleaseCommands: options.customReleaseCommands,
    postReleaseCommands: options.postReleaseCommands,
    changelogUsername: options.changelogUsername,
    finishRelease: options.finishRelease,
    postReleaseFinishedCommands: options.postReleaseFinishedCommands,
    customReleaseFinishCommands: options.customReleaseFinishCommands,
    releaseMessagePrefix: options.releaseMessagePrefix,
    disableRollback: options.disableRollback
  };
  this.buildTimestamp = Date.now();
  this.currentVersion = options.currentVersion;
  this.newVersion = false;
  this.newBranchName = false;
  this.isContinuation = false;
  this.doFinish = false;
  this.releaseMessage = '';

  if (this.options.debug) {
    console.log('Release.options:', this.options);
  }
}

Release.prototype.setBranchName = function() {
  this.newBranchName = this.newVersion;
  if (this.options.buildTimestampInName) {
    this.newBranchName += '-' + this.buildTimestamp;
  }
};

Release.prototype.bump = function(parameterVersion) {
  this.newVersion = bump(this.currentVersion, parameterVersion);
  console.log('New version: %s', this.newVersion);
};

Release.prototype.rollback = function(exit) {
  if (this.options.disableRollback) {
    if (this.options.debug) {
      console.log(chalk.yellow('rollback disabled'));  
    }
    return;
  }
  if (this.options.debug) {
    this.rollbackDebug(exit);
  } else {
    console.log(chalk.yellow('rollback...'));
    var _this = this;
    var phasenRollback = [];
    if (this.options.createChangelog) {
      phasenRollback.push(function() { _this.deleteChangelog() });
    }
    phasenRollback.push(git.hardReset);
    phasenRollback.push(git.checkoutDevelop);
    if (this.options.finishRelease) {
      phasenRollback.push(git.deleteTag);
      phasenRollback.push(git.deleteReleaseBranch);
    }
    phasenRollback.push(git.deleteLocalReleaseBranch);
    var rollback = pipeline(phasenRollback);
    rollback.then(function() {
      console.log(chalk.yellow('Rollback successful'));
      if (exit) {
        process.exit(1);
      }
    }).catch(function(rollbackError) {
      if (typeof rollbackError !== 'undefined') {
        console.log(chalk.red('ERROR: ' + rollbackError));
      }
      if (exit) {
        process.exit(1);
      }
    });
  }
};

Release.prototype.rollbackDebug = function(exit) {
  console.log('Release.rollback()');
  console.log(chalk.yellow('rollback...'));
  var _this = this;
  var phasenRollback = [];
  if (this.options.createChangelog) {
    phasenRollback.push(function() {
      console.log('Release.deleteChangelog()'); 
      _this.deleteChangelog()
    });
  }
  phasenRollback.push(function() {
    console.log('git.hardReset()');
    return git.hardReset();
  });
  phasenRollback.push(function() {
    console.log('git.checkoutDevelop()');
    return git.checkoutDevelop();
  });
  phasenRollback.push(function() {
    console.log('git.deleteTag()');
    return git.deleteTag();
  });
  phasenRollback.push(function() {
    console.log('git.deleteReleaseBranch()');
    return git.deleteReleaseBranch();
  });
  phasenRollback.push(function() {
    console.log('git.deleteLocalReleaseBranch()');
    return git.deleteLocalReleaseBranch();
  });
  var rollback = pipeline(phasenRollback);
  rollback.then(function() {
    console.log(chalk.yellow('Rollback successful'));
    if (exit) {
      process.exit(1);
    }
  }).catch(function(rollbackError) {
    if (typeof rollbackError !== 'undefined') {
      console.log(chalk.red('ERROR: ' + rollbackError));
    }
    if (exit) {
      process.exit(1);
    }
  });
};

Release.prototype.deleteChangelog = function() {
  sh.rm('-rf', path.join(this.options.changelogFolder, this.newBranchName + '.md'));
};

Release.prototype.createChangelog = function() {
  if (this.options.debug) {
    console.log('Release.createChangelog()');
  }
  return createChangelog({
    folder: this.options.changelogFolder,
    filename: this.newBranchName,
    version: this.newVersion,
    timestamp: this.buildTimestamp,
    commitURL: this.options.commitURL,
    releaseURL: this.options.releaseURL,
    packageName: this.options.packageName,
    packageStatus: this.options.packageStatus,
    neverendingChangelog: this.options.neverendingChangelog,
    neverendingChangelogFilename: this.options.neverendingChangelogFilename,
    changelogUsername: this.options.changelogUsername
  });
};

Release.prototype.updatePackage = function(addTimestamp) {
  if (this.options.debug) {
    console.log('Release.updatePackage()');
  }
  if (typeof addTimestamp === 'undefined') {
    addTimestamp = true;
  } else {
    this.buildTimestamp = false;
  }
  return updatePackageFile(
    this.options.packageDefinitionPath,
    this.newVersion,
    this.buildTimestamp,
    this.options.packageSpaces
  );
};

Release.prototype.updatePackageLock = function() {
  return updatePackageLock();
}

Release.prototype.runCommands = function(commands) {
  var _this = this;
  if (this.options.debug) {
    console.log('Release.runCommands()', commands);
  }
  return when.promise(function(resolve, reject) {
    var commandPipe = [];

    commands.forEach(function(command) {
      commandPipe.push(function() {
        return when.promise(function(resolve, reject) {
          exec(command, function(error, stdout, stderr) {
            if (error != null) {
              console.log(stdout);
              if (stderr) {
                console.log(stderr);
              }
              reject(error);
            } else {
              if (_this.options.debug) {
                console.log(stdout);
              }
              resolve();
            }
          });
        })
      });
    });

    pipeline(commandPipe).then(function() {
      resolve();
    }).catch(function(error) {
      reject(error);
    });
  });
};

Release.prototype.checkPreConditions = function() {
  if (this.options.debug) {
    console.log('Release.checkPreConditions()');
  }
  return this.runCommands(this.options.preConditionCommands);
};

Release.prototype.runCustomReleaseFinishCommands = function() {
  if (this.options.debug) {
    console.log('Release.runCustomReleaseFinishCommands()', this.options.customReleaseFinishCommands);
  }
  return this.runCommands(this.options.customReleaseFinishCommands);
};

Release.prototype.runPostReleaseFinishedCommands = function() {
  if (this.options.debug) {
    console.log('Release.runPostReleaseFinishedCommands()', this.options.postReleaseFinishedCommands);
  }
  return this.runCommands(this.options.postReleaseFinishedCommands);
};

Release.prototype.runCustomReleaseCommands = function() {
  if (this.options.debug) {
    console.log('Release.runCustomReleaseCommands()', this.options.customReleaseCommands);
  }
  return this.runCommands(this.options.customReleaseCommands);
};

Release.prototype.runPostReleaseCommands = function() {
  if (this.options.debug) {
    console.log('Release.runPostReleaseCommands()');
  }
  return this.runCommands(this.options.postReleaseCommands);
};

Release.prototype.commitChanges = function() {
    if (this.options.debug) {
      console.log('Release.commitChanges()');
    }
    var filesToCommit = [];
    if (this.options.packageDefinitionPath) {
      filesToCommit.push(path.basename(this.options.packageDefinitionPath));
      if (hasPackageLock()) {
        filesToCommit.push('package-lock.json');
      }
    }
    if (this.options.createChangelog && (this.options.finishRelease || this.doFinish)) {
      if (this.options.neverendingChangelog) {
        filesToCommit.push(this.options.neverendingChangelogFilename);
      } else {
        filesToCommit.push(path.join(this.options.changelogFolder, this.newBranchName + '.md'))
      }
    }
    if (filesToCommit.length) {
      return git.failSafeCommitChanges(
        [this.options.releaseMessagePrefix, this.newVersion].join(' '),
        filesToCommit
      );
    }
    return when.resolve();
}

Release.prototype.createBranch = function() {
  if (this.options.debug) {
    console.log('Release.createBranch()');
  }
  if (git.branchExistSync(`release/${this.newBranchName}`) || git.branchExistSync(`origin/release/${this.newBranchName}`)) {
    if (this.options.debug) {
      console.log('Release.createBranch() - branch exists - checkout');
    }
    this.isContinuation = true;
    return git.checkoutBranch(`release/${this.newBranchName}`);
  } else {
    if (this.options.debug) {
      console.log('Release.createBranch() - git flow release start');
    }
    return git.releaseStart(this.newBranchName);
  }

};

Release.prototype.pushChanges = function() {
  if (this.options.debug) {
    console.log('Release.pushChanges()');
  }
  return git.pushChanges(this.newBranchName);
};

Release.prototype.finishRelease = function() {
  if (this.options.debug) {
    console.log('Release.finishRelease()');
  }
  return git.finishRelease(this.options.push, this.options.keep, this.newBranchName, this.releaseMessage);
};

Release.prototype.isEverythingPushed = function() {
  if (this.options.debug) {
    console.log('Release.isEverythingPushed()');
  }
  return when.promise(function(resolve, reject) {
    git.getCommitsDiffDevelop().then(function(count) {
      if (count > 0) {
        reject('push your changes first');
      } else {
        resolve();
      }
    }, reject);
  });
};

Release.prototype.isMasterUpToDate = function() {
  if (this.options.debug) {
    console.log('Release.isMasterUpToDate()');
  }
  return when.promise(function(resolve, reject) {
    git.checkoutMaster()
    .then(git.getCommitsDiffMaster)
    .then(function(count) {
      if (count > 0) {
        reject('update your master branch first (git checkout master && git pull)');
      } else {
        resolve();
      }
    }, reject);
  });
};

Release.prototype.createReleaseMessage = function() {
  var _this = this;
  return when.promise(function(resolve, reject) {
    createReleaseMessage().then(function(releaseMessage) {
      _this.releaseMessage = releaseMessage;
      resolve();
    }, reject);
  });
};

Release.prototype.checkoutReleaseBranch = function() {
  if (this.options.debug) {
    console.log('Release.checkoutReleaseBranch()');
  }
  return git.checkoutBranch(`release/${this.newBranchName}`);
}

Release.prototype.finish = function() {
  if (this.options.debug) {
    console.log('Release.finish()');
  }
  var _this = this;
  this.doFinish = true;
  var releaseStack = [
    git.updateRemotes,
    git.checkoutDevelop,
    git.isUpToDate,
    this.isEverythingPushed.bind(this),
    this.isMasterUpToDate.bind(this),
    this.checkoutReleaseBranch.bind(this)
  ];

  // update changelog
  if (this.options.createChangelog) {
    releaseStack.push(this.createChangelog.bind(this));
  }

  // update release message
  releaseStack.push(this.createReleaseMessage.bind(this));

  if (this.options.packageDefinitionPath) {
    releaseStack.push(this.updatePackage.bind(this));
    if (hasPackageLock()) {
      releaseStack.push(this.updatePackageLock.bind(this));
    }
  }

  if (this.options.customReleaseFinishCommands.length) {
    releaseStack.push(this.runCustomReleaseFinishCommands.bind(this));
  }

  releaseStack.push(this.commitChanges.bind(this));
  releaseStack.push(this.pushChanges.bind(this));
  releaseStack.push(this.finishRelease.bind(this));

  if (_this.options.postReleaseFinishedCommands.length) {
    releaseStack.push(_this.runPostReleaseFinishedCommands.bind(_this));
  }

  var releasePromise = pipeline(releaseStack);
  releasePromise.then(function() {
    console.log(chalk.green(_this.newBranchName + ' has been successfully released!'));
    process.exit(0);
  }).catch(function(error) {
    if (typeof error !== 'undefined') {
      console.log(chalk.red('error: ' + error));
    }
    process.exit(1);
  });

}

Release.prototype.release = function() {
  if (this.options.debug) {
    console.log('Release.release()');
  }
  var _this = this;
  var releaseStack = [
    this.checkPreConditions.bind(this),
    git.updateRemotes,
    git.checkoutDevelop,
    git.isUpToDate,
    this.isEverythingPushed.bind(this),
    this.isMasterUpToDate.bind(this),
    function() { 
      doRollBack = true; 
      return _this.createBranch(); 
    },
    // do not rollback if it's a continuation
    function() {
      if (this.isContinuation) {
        doRollBack = false;
      }
      return Promise.resolve();
    }
  ];
  if (this.options.finishRelease) {
    if (this.options.createChangelog) {
      releaseStack.push(this.createChangelog.bind(this));
    }
    releaseStack.push(this.createReleaseMessage.bind(this));
  }
  if (this.options.packageDefinitionPath) {
    if (this.options.finishRelease) {
      releaseStack.push(this.updatePackage.bind(this));
    } else {
      // update timestamp on release finish
      releaseStack.push(() => {
        return _this.updatePackage(false);
      });
    }
    if (hasPackageLock()) {
      releaseStack.push(this.updatePackageLock.bind(this));
    }
  }
  if (this.options.customReleaseCommands.length) {
    releaseStack.push(this.runCustomReleaseCommands.bind(this));
  }
  releaseStack.push(this.commitChanges.bind(this));
  releaseStack.push(this.pushChanges.bind(this));
  if (this.options.finishRelease) {
    releaseStack.push(this.finishRelease.bind(this));
  }
  if (_this.options.postReleaseCommands.length) {
    releaseStack.push(_this.runPostReleaseCommands.bind(_this));
  }

  var releasePromise = pipeline(releaseStack);
  releasePromise.then(function() {
    console.log(chalk.green(_this.newBranchName + ' has been successfully released!'));
    process.exit(0);
  }).catch(function(error) {
    if (typeof error !== 'undefined') {
      console.log(chalk.red('error: ' + error));
    }
    if (doRollBack) {
      _this.rollback(true);
    } else {
      process.exit(1);
    }
  });

}



module.exports = Release;
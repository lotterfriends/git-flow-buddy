#!/usr/bin/env node

var when = require('when');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var chalk = require('chalk');
var sh  = require('shelljs');

var _getLastCommit = function() {
  return when.promise(function(resolve, reject) {
    exec('git log -n 1 --pretty=%H', function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
};

var _getReleaseBranchName = function() {
  return when.promise(function(resolve, reject) {
    exec('git branch --list release*', function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve(stdout.trim().replace(/release\//, ''));
      }
    });
  });
};

var _deleteTag = function(branchName, noRemote) {
  return when.promise(function(resolve, reject) {
    if (!branchName) {
      _getReleaseBranchName().then(function(branchName) {
        exec('git tag -d ' + branchName, function(error, stdout, stderr) {
          if (!noRemote) {
            exec('git push origin :refs/tags/' + branchName, function(error, stdout, stderr) {
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    } else {
      exec('git tag -d ' + branchName, function(error, stdout, stderr) {
        if (!noRemote) {
          exec('git push origin :refs/tags/' + branchName, function(error, stdout, stderr) {
            resolve();
          });
        } else {
          resolve();
        }
      });
    }
  });
};

var _deleteReleaseBranch = function(branchName) {
  return when.promise(function(resolve, reject) {
    if (!branchName) {
      _getReleaseBranchName().then(function(branchName) {
        // no release branch to delete
        if (!branchName) {
          resolve();
        } else {
          exec('git push origin --delete release/' + branchName, function(error, stdout, stderr) {
            if (error != null) {
              resolve();
            } else {
              resolve();
            }
          });
        }
      }, reject);
    } else {
      // no release branch to delete
      if (!branchName) {
        resolve();
      } else {
        exec('git push origin --delete release/' + branchName, function(error, stdout, stderr) {
          if (error != null) {
            resolve();
          } else {
            resolve();
          }
        });
      }
    }
  });
};

var _deleteLocalReleaseBranch = function(branchName) {
  return when.promise(function(resolve, reject) {
    if (!branchName) {
      _getReleaseBranchName().then(function(branchName) {
        // no release branch to delete
        if (!branchName) {
          resolve();
        } else {
          exec('git branch -D release/' + branchName, function(error, stdout, stderr) {
            if (error != null) {
              reject(error);
            } else {
              resolve();
            }
          });
        }
      }, reject);
    } else {
      // no release branch to delete
      if (!branchName) {
        resolve();
      } else {
        exec('git branch -d release/' + branchName, function(error, stdout, stderr) {
          if (error != null) {
            reject(error);
          } else {
            resolve();
          }
        });
      }
    }
  });
};


var _isUpToDate = function() {
  return when.promise(function(resolve, reject) {
    exec('git status', function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        if (stdout.indexOf('Changes not staged for commit') > -1) {
          return reject('Changes not staged for commit, don\' forget  to commit and push');
        }
        if (stdout.indexOf('Untracked files') > -1) {
          console.log(chalk.yellow('WARNING: some files not under version control'));
        }
        resolve();
      }
    });
  });
};

var _updateRemotes = function() {
  return when.promise(function(resolve, reject) {
    exec('git remote update', function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

var _getCommitsDiff = function(branch) {
  return when.promise(function(resolve, reject) {
    exec('git rev-list HEAD...origin/' + branch  + ' --count', function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve(parseInt(stdout, 10));
      }
    });
  });
};

var _getCommitsDiffMaster = function() {
  return _getCommitsDiff('master');
};

var _getCommitsDiffDevelop = function() {
  return _getCommitsDiff('develop');
};

var _createBranch = function(branchName) {
  return when.promise(function(resolve, reject) {
    exec('git flow release start ' + branchName, function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

var _commitChanges = function(message, filesToCommit) {
  return when.promise(function(resolve, reject) {
    exec('git add ' + filesToCommit.join(' '), function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        exec('git commit -m \"' + message + '\" ' + filesToCommit.join(' '), function(error, stdout, stderr) {
          if (error != null) {
            reject(error);
          } else {
            resolve();
          }
        });
      }
    });
  });
};

var _pushChanges = function(message) {
  return when.promise(function(resolve, reject) {
    exec('git flow release publish ' + message, function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

var _getGitHomeSync = function() {
  var commandResult = '';
  try {
    commandResult = execSync('git rev-parse --git-dir', {stdio:['pipe', 'pipe', 'ignore']});
  } catch (exception) {
    //
  }
  if (typeof commandResult === 'object') {
    commandResult = commandResult.toString()
  }
  return commandResult.trim();
}

var _finishRelease = function(push, keep, branchName, message) {
  return when.promise(function(resolve, reject) {
    var doPush = (push) ? '-p ': '';
    var doKeep = (keep) ? '-k ': '';

    var gitHome = _getGitHomeSync();
    // hack for multiline release messages
    sh.ShellString(message).to(gitHome + '/MY_TAGMSG');
    execSync('git config core.editor "mv ' + gitHome + '/MY_TAGMSG"', {stdio:['pipe', 'pipe', 'ignore']});

    exec('git flow release finish ' + doPush + doKeep + branchName, function(error, stdout, stderr) {

      // reset the hack
      execSync('git config --unset core.editor"', {stdio:['pipe', 'pipe', 'ignore']});

      if (error != null) {
        reject(error);
      } else {
        console.log(stdout);
        resolve();
      }
    });
  });
}


var _checkoutBranch = function(branch) {
  return when.promise(function(resolve, reject) {
    exec('git checkout -f ' + branch, function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

var _getLastTag = function() {
  return when.promise(function(resolve, reject) {
    exec('git describe --tags', function(error, stdout, stderr) {
      if (error != null) {
        reject(error);
      } else {
        resolve(stdout.split('-')[0].trim());
      }
    });
  });
};

var _getLastTagSync = function() {
  var commandResult = '';
  try {
    commandResult = execSync('git describe --tags', {stdio:['pipe', 'pipe', 'ignore']});
  } catch (exception) {
    //
  }
  if (typeof commandResult === 'object') {
    commandResult = commandResult.toString()
  }
  return commandResult.split('-')[0].trim();
};

var _fetchTags = function() {
  return when.promise(function(resolve, reject) {
    exec('git fetch --tags', function(error) {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

var _checkoutDevelop = function() {
  return _checkoutBranch('develop');
};


var _checkoutMaster = function() {
  return _checkoutBranch('master');
};

var _hardReset = function() {
  return when.promise(function(resolve, reject) {
    _getLastCommit().then(function(lastCommit) {
      exec('git reset --hard ' + lastCommit, function(error, stdout, stderr) {
        if (error != null) {
          reject(error);
        } else {
          resolve();
        }
      });
    }, reject);
  });
};

var _branchExist = function(branch) {
  return when.promise(function(resolve, reject) {
    exec('git rev-parse --verify ' + branch, function(error, stdout, stderr) {
      if (error != null) {
        reject();
      } else {
        resolve();
      }
    });
  });
};

var _getUser = function() {
  return when.promise(function(resolve, reject) {
    exec('git config user.name', function(errorUsername, stdoutUsername, stderrUsername) {
      if (errorUsername != null) {
        reject('git username not not set, set the username with: git config --global user.name "John Doe"');
      } else {
        resolve(stdoutUsername.trim());
      }
    });
  });
};

var _getVersionPrefix = function() {
  
  return when.promise(function(resolve, reject) {
    exec('git config --get gitflow.prefix.versiontag', function(errorVersionT, stdoutUsername, stderrUsername) {
      if (errorVersionT != null) {
        reject('git config --get gitflow.prefix.versiontag failed');
      } else {
        resolve(stdoutUsername.trim());
      }
    });
  });
}

var _getVersionPrefixSync = function() {
  var commandResult = '';
  try {
    commandResult = execSync('git config --get gitflow.prefix.versiontag', {stdio:['pipe', 'pipe', 'ignore']});
  } catch (exception) {
    //
  }
  if (typeof commandResult === 'object') {
    commandResult = commandResult.toString()
  }
  return commandResult.trim()
}

var _resetBranchWithOrigin = function(branch) {
  return when.promise(function(resolve, reject) {
    _checkoutBranch(branch).then(function() {
      exec('git reset --hard origin/' + branch, function(error) {
        if (error != null) {
          reject('git reset --hard origin/' + branch + ' failed ' + error);
        } else {
          resolve();
        }
      });

    }, reject);
  });
}


module.exports = {
    getLastCommit: _getLastCommit,
    getReleaseBranchName: _getReleaseBranchName,
    deleteTag: _deleteTag,
    deleteReleaseBranch: _deleteReleaseBranch,
    deleteLocalReleaseBranch: _deleteLocalReleaseBranch,
    isUpToDate: _isUpToDate,
    createBranch: _createBranch,
    checkoutDevelop: _checkoutDevelop,
    checkoutMaster: _checkoutMaster,
    commitChanges: _commitChanges,
    pushChanges: _pushChanges,
    finishRelease: _finishRelease,
    checkoutBranch: _checkoutBranch,
    hardReset: _hardReset,
    getUser: _getUser,
    getVersionPrefix: _getVersionPrefix,
    getVersionPrefixSync: _getVersionPrefixSync,
    updateRemotes: _updateRemotes,
    getCommitsDiff: _getCommitsDiff,
    getCommitsDiffMaster: _getCommitsDiffMaster,
    getCommitsDiffDevelop: _getCommitsDiffDevelop,
    getLastTag: _getLastTag,
    getLastTagSync: _getLastTagSync,
    resetBranchWithOrigin: _resetBranchWithOrigin,
    fetchTags: _fetchTags
}

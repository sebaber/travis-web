import Ember from 'ember';
import limit from 'travis/utils/computed-limit';
import Repo from 'travis/models/repo';

var sortCallback = function(repo1, repo2) {
  // this function could be made simpler, but I think it's clearer this way
  // what're we really trying to achieve

  var lastBuild1 = repo1.get('defaultBranch.lastBuild');
  var lastBuild2 = repo2.get('defaultBranch.lastBuild');

  if(!lastBuild1 && !lastBuild2) {
    // if both repos lack builds, put newer repo first
    return repo1.get('id') > repo2.get('id') ? -1 : 1;
  } else if(lastBuild1 && !lastBuild2) {
    // if only repo1 has a build, it goes first
    return -1;
  } else if(lastBuild2 && !lastBuild1) {
    // if only repo2 has a build, it goes first
    return 1;
  }

  var finishedAt1 = lastBuild1.get('finishedAt');
  var finishedAt2 = lastBuild2.get('finishedAt');

  if(finishedAt1) {
    finishedAt1 = new Date(finishedAt1);
  }
  if(finishedAt2) {
    finishedAt2 = new Date(finishedAt2);
  }

  if(finishedAt1 && finishedAt2) {
    // if both builds finished, put newer first
    return finishedAt1.getTime() > finishedAt2.getTime() ? -1 : 1;
  } else if(finishedAt1 && !finishedAt2) {
    // if repo1 finished, but repo2 didn't, put repo2 first
    return 1;
  } else if(finishedAt2 && !finishedAt1) {
    // if repo2 finisher, but repo1 didn't, put repo1 first
    return -1;
  } else {
    // none of the builds finished, put newer build first
    return lastBuild1.get('id') > lastBuild2.get('id') ? -1 : 1;
  }

  throw "should not happen";
};



var Controller = Ember.Controller.extend({
  ajax: Ember.inject.service(),

  actions: {
    activate: function(name) {
      return this.activate(name);
    },
    showRunningJobs: function() {
      return this.activate('running');
    },
    showMyRepositories: function() {
      if (this.get('tab') === 'running') {
        return this.activate('owned');
      } else {
        return this.transitionToRoute('main.repositories');
      }
    }
  },

  tabOrIsLoadedDidChange: function() {
    return this.possiblyRedirectToGettingStartedPage();
  }.observes('isLoaded', 'tab', 'repos.length'),

  possiblyRedirectToGettingStartedPage() {
    return Ember.run.scheduleOnce('routerTransitions', this, function() {
      if (this.get('tab') === 'owned' && this.get('isLoaded') && this.get('repos.length') === 0) {
        return this.container.lookup('router:main').send('redirectToGettingStarted');
      }
    });
  },

  isLoaded: false,
  repoController: Ember.inject.controller('repo'),
  currentUserBinding: 'auth.currentUser',

  selectedRepo: function() {
    return this.get('repoController.repo.content') || this.get('repoController.repo');
  }.property('repoController.repo', 'repoController.repo.content'),

  startedJobsCount: Ember.computed.alias('runningJobs.length'),

  allJobsCount: function() {
    return this.get('startedJobsCount') + this.get('queuedJobs.length');
  }.property('startedJobsCount', 'queuedJobs.length'),

  init() {
    this._super.apply(this, arguments);
    if (!Ember.testing) {
      return Visibility.every(this.config.intervals.updateTimes, this.updateTimes.bind(this));
    }
  },

  runningJobs: function() {
    var result;

    result = this.store.filter('job', {}, function(job) {
      return ['queued', 'started', 'received'].indexOf(job.get('state')) !== -1;
    });
    result.set('isLoaded', false);
    result.then(function() {
      return result.set('isLoaded', true);
    });

    return result;
  }.property(),

  queuedJobs: function() {
    var result;
    result = this.get('store').filter('job', {}, function(job) {
      return ['created'].indexOf(job.get('state')) !== -1;
    });
    result.set('isLoaded', false);
    result.then(function() {
      result.set('isLoaded', true);
    });

    return result;
  }.property(),

  recentRepos: function() {
    return [];
  }.property(),

  updateTimes() {
    var repos;
    if (repos = this.get('repos')) {
      return repos.forEach(function(r) {
        return r.updateTimes();
      });
    }
  },

  activate(tab, params) {
    this.set('sortProperties', ['sortOrder']);
    this.set('tab', tab);
    return this[("view_" + tab).camelize()](params);
  },

  viewOwned() {
    var repos, user;

    if (repos = this.get('ownedRepos')) {
      return this.set('_repos', repos);
    } else if (!this.get('fetchingOwnedRepos')) {
      this.set('fetchingOwnedRepos', true);
      this.set('isLoaded', false);

      if (user = this.get('currentUser')) {
        user.get('_rawPermissions').then( (data) => {
          repos = Repo.accessibleBy(this.store, data.pull).then(
            (reposRecordArray) => {
              this.set('isLoaded', true);
              this.set('_repos', reposRecordArray);
              this.set('ownedRepos', reposRecordArray);
              this.set('fetchingOwnedRepos', false);
              return reposRecordArray;
            });
        });
      }
    }
  },

  viewRunning() {},

  viewSearch(phrase) {
    this.set('search', phrase);
    this.set('isLoaded', false);
    Repo.search(this.store, this.get('ajax'), phrase).then( (reposRecordArray) => {
      this.set('isLoaded', true);
      this.set('_repos', reposRecordArray);
    });
  },

  searchObserver: function() {
    var search;
    search = this.get('search');
    if (search) {
      return this.searchFor(search);
    }
  }.observes('search'),

  searchFor(phrase) {
    if (this.searchLater) {
      Ember.run.cancel(this.searchLater);
    }
    this.searchLater = Ember.run.later(this, (function() {
      this.transitionTo('main.search', phrase.replace(/\//g, '%2F'));
    }), 500);
  },

  noReposMessage: function() {
    var tab;
    tab = this.get('tab');
    if (tab === 'owned') {
      return 'You don\'t have any repos set up on Travis CI';
    } else if (tab === 'recent') {
      return 'Repositories could not be loaded';
    } else {
      return 'Could not find any repos';
    }
  }.property('tab'),

  showRunningJobs: function() {
    return this.get('tab') === 'running';
  }.property('tab'),

  repos: function() {
    var repos = this.get('_repos');

    if(repos && repos.toArray) {
      repos = repos.toArray();
    }

    if(repos && repos.sort) {
      return repos.sort(sortCallback);
    } else {
      return [];
    }
  }.property('_repos.[]', '_repos.@each.lastBuildFinishedAt',
             '_repos.@each.lastBuildId')
});

export default Controller;

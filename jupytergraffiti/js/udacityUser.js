define([
  './state.js'
], function(state) {  
  const NEBULA_URL = 'https://nebula.udacity.com';

  function getToken() {
		const executeCallbackObject = (callback) => ({
		  iopub: {
		    output: (data) => {
		      data.content.text ? callback(data.content.text) : null
		    }
		  }
		});
		return new Promise((resolve, reject) => {
		  Jupyter.notebook.kernel.execute(
		    '!curl "http://metadata.google.internal/computeMetadata/v1/instance/attributes/keep_alive_token" -H "Metadata-Flavor: Google"',
		    executeCallbackObject(output => resolve(output))
		  );
		});
	}

  function getUdacityUser(token) {
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", `${NEBULA_URL}/api/v1/remote/me`);
      xhr.setRequestHeader("Authorization", "Star " + token);
      xhr.onload = function () {
        if (this.status >= 200 && this.status < 300) {
          resolve(JSON.parse(xhr.response));
        } else {
          reject({
            status: this.status,
            statusText: xhr.statusText
          });
        }
      };
      xhr.onerror = function () {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      };
      xhr.send();
    });
  }
        
  const udacityUser = {
    token: null,
    usageReportSent: false,
    getUser: () => {
      return getToken().then(token => {
        udacityUser.token = token;
        return getUdacityUser(token);
      });
    },
    setUser: () => {
      udacityUser.getUser()
      .then(user => {
        state.setUserId(user.userId);
        user.coco && $('#graffiti-setup-button').css('display', 'inline-block');
      })
      .catch(err => console.error(err));
    },
    trackUsageStats: () => {
      if (!udacityUser.usageReportSent) {
        let xhr = new XMLHttpRequest();
        // Async is set to false to make this request work on unload event
        xhr.open("POST", `${NEBULA_URL}/api/v1/remote/track-graffiti`, false);
        xhr.setRequestHeader("Authorization", "Star " + udacityUser.token);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(state.getUsageStats()));
      }
    }
  }

  return udacityUser;
});

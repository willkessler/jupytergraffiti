define([
  'jupytergraffiti/js/state.js'
], function(state) {  
  const BELLATRIX_URL = 'https://bellatrix.udacity.com';
  const NEBULA_URL = 'https://nebula.udacity.com';

  function getToken() {
    const kernelName = Jupyter.notebook.kernel.name;
    const executeCallbackObject = (callback) => ({
      iopub: {
        output: (data) => {
          let tokenText = '';
          if (kernelName === 'ir') {
            tokenText = data.content.data && data.content.data['text/html'];
            tokenText = tokenText.replace(/'/g, "");
          } else {
            tokenText = data.content.text;
          }
          tokenText ? callback(tokenText) : null
        }
      }
    });
    return new Promise((resolve, reject) => {
      const gcloudMetadaUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/keep_alive_token';
      let bashCommand = '';
      let execOptions = {}
      if (kernelName === 'ir') {
        bashCommand = `system('curl "${gcloudMetadaUrl}" -H "Metadata-Flavor: Google" -s --fail', intern=TRUE)`;
        execOptions = {
          silent: false
        };
      } else {
        bashCommand = `!curl "${gcloudMetadaUrl}" -H "Metadata-Flavor: Google" -s --fail`;
      }
      Jupyter.notebook.kernel.execute(
        bashCommand,
        executeCallbackObject(output => resolve(output)),
        execOptions
      );
    });
  }

  function getWorkspace(token) {
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
        
  const workspace = {
    token: null,
    usageReportSent: false,
    getWorkspace: () => {
      if (!workspace.isUdacityEnv()) {
        return Promise.resolve({
          userId: 'dev',
          coco: true
        })
      }
      return getToken().then(token => {
        workspace.token = token;
        return getWorkspace(token);
      });
    },
    isUdacityEnv: () => {
      const hostname = location.hostname;
      return (
        hostname.endsWith('udacity.com' ) ||
        hostname.endsWith('udacity-student-workspaces.com')
      );
    },
    setWorkspace: () => {
      return workspace.getWorkspace()
      .then(data => {
        state.setUserId(data.userId);
        state.setWorkspace(data);
      })
      .catch(err => console.error(err));
    },
    trackUsageStats: () => {
      if (workspace.usageReportSent ||
          !workspace.isUdacityEnv() ||
          // This may happen if sendBeacon is not supported (in IE for example)
          !navigator.sendBeacon) {
            return;
      }
      let stats = state.getUsageStats();
      stats.workspace = state.getWorkspace();
      navigator.sendBeacon(`${BELLATRIX_URL}/api/v1/graffiti/stats`, JSON.stringify(stats));
      workspace.usageReportSent = true;
    }
  }

  return workspace;
});

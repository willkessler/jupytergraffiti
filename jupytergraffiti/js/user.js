const UdacityUser = (function(){
	function getToken() {
		const executeCallbackObject = (callback) => ({
		  iopub: {
		    output: (data) => {
		      console.log('get token result', data);
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
    const context = this;
    return new Promise((resolve, reject) => {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "https://nebula.udacity.com/api/v1/remote/me");
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

	return {
		getUdacityUser, getToken
	}
})();

define([
  './utils.js',
  './state.js'
], function(utils, state) {
        
  // Stub function, in Udacity usage we use a Udacity id instead.
  const udacityUser = {
    getUser: () => {
      return new Promise((resolve) => { 
        resolve({
          userId: utils.generateUniqueId()
        })
      })
    },
    setUser: () => {
      udacityUser.getUser()
      .then(user => {
        state.setUserId(user.userId)
      })
    }
  }

  return udacityUser;
});

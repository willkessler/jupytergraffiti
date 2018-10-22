var gulp = require('gulp');
var replace = require('gulp-replace');

gulp.task('extension', function() {
  gulp.src(['./js/*', './css/*', './fonts/*'])
    .pipe(replace(/\.\/.*\.js/gm, function(match) {
      console.log(match);
      return '/nbextensions/graffiti_extension' + match.substring(1); 
    }))
    .pipe(replace('../fonts', function(match) {
      return '/nbextensions/graffiti_extension';
    }))
    .pipe(replace('../images', function(match) {
      return '/nbextensions/graffiti_extension';
    }))
    .pipe(replace(/jupytergraffiti\/css/gm, function(match) {
      return '/nbextensions/graffiti_extension';
    }))
    .pipe(replace('jupytergraffiti/js/', function(match) {
      return '/nbextensions/graffiti_extension/';
    }))
    .pipe(gulp.dest('graffiti_extension/'));
});

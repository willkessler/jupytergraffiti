var gulp = require('gulp');
var concat = require('gulp-concat');
var stripDebug = require('gulp-strip-debug');
var uglify = require('gulp-uglify-es').default;
var amdOptimize = require('amd-optimize');

gulp.task('extension', function() {
  return gulp.src(['./js/LZString.js',
                   './js/utils.js',
                   './js/storage.js',
                   './js/audio.js',
                   './js/state.js',
                   './js/annotations.js'])
//             .pipe(amdOptimize('annotations'))
             .pipe(concat('final.js'))
             .pipe(stripDebug())
//             .pipe(uglify())
             .pipe(gulp.dest('./graffiti_extension/dist/'));
});

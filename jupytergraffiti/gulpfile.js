const gulp = require('gulp');
const replace = require('gulp-replace');
const babel = require("gulp-babel");
const merge = require('merge-stream');

gulp.task("prebuild", () => {
  const main = gulp.src('graffiti_extension/main.js') 
                   .pipe(babel())
                   .pipe(gulp.dest('build'));
  
  const js = gulp.src('js/**/*.js') 
                 .pipe(babel())
                 .pipe(gulp.dest('build/js'));
  
  return merge(main, js)
});

gulp.task("move-styles", () => {
  return gulp.src(['graffiti-dist/graffiti.js', './css/*', './fonts/*'])
             .pipe(replace('../fonts', function() {
               return '/nbextensions/graffiti-dist';
             }))
             .pipe(replace(/jupytergraffiti\/css/gm, function() {
               return '/nbextensions/graffiti-dist';
             }))
             .pipe(gulp.dest('graffiti-dist/'));
})

gulp.task("watch", () => {
  gulp.watch(dirs.src, ["build"]);
})

gulp.task("default", ["watch"]);

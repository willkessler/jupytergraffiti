import gulp from 'gulp';
import merge from 'gulp-concat';
import babel from 'gulp-babel';
import uglify from 'gulp-uglify';
import replace from 'gulp-replace';

const paths = {
  main: {
    src: ['graffiti_extension/main.js'],
    dest: 'build'
  },
  jsFiles: {
    src: ['js/**/*.js'],
    dest: 'build/js'
  },
  moveStyles: {
    src: ['graffiti-dist/graffiti.js', './css/*'],
    dest: 'graffiti-dist'
  },
  pipMain: {
    src: ['graffiti_extension/main.js'],
    dest: '../build_for_pip/code-prep/jupytergraffiti'
  },
  pipJsFiles: {
    src: ['js/**/*.js'],
    dest: '../build_for_pip/code-prep/jupytergraffiti/js'
  },
  pipMoveStyles: {
    src: ['../build_for_pip/code-prep/build/jupytergraffiti/graffiti.js', './css/*'],
    dest: '../build_for_pip/code-prep/build/jupytergraffiti'
  }
};


export function main() {
  return gulp.src(paths.main.src) 
             .pipe(babel())
             .pipe(replace(/jupytergraffiti\/js/gm, function() {
               return('js');
             }))
             .pipe(gulp.dest(paths.main.dest));
}

export function jsFiles() {
  return  gulp.src(paths.jsFiles.src)
              .pipe(babel())
              .pipe(replace(/jupytergraffiti\/js/gm, function() {
                return('js');
              }))
              .pipe(gulp.dest(paths.jsFiles.dest));
}

export function moveStyles() {
  return gulp.src(paths.moveStyles.src)
             .pipe(replace(/jupytergraffiti\/css/gm, function() {
               return '/nbextensions/graffiti-dist';
             }))
             .pipe(gulp.dest(paths.moveStyles.dest));
}

export function pipMain() {
  return gulp.src(paths.pipMain.src) 
             .pipe(babel())
             .pipe(replace(/jupytergraffiti\/js/gm, function() {
               return('js');
             }))
             .pipe(gulp.dest(paths.pipMain.dest));
}

export function pipJsFiles() {
  return  gulp.src(paths.pipJsFiles.src)
              .pipe(babel())
              .pipe(replace(/jupytergraffiti\/js/gm, function() {
                return('js');
              }))
              .pipe(gulp.dest(paths.pipJsFiles.dest));
}

export function pipMoveStyles() {
  return gulp.src(paths.pipMoveStyles.src)
             .pipe(replace(/jupytergraffiti\/css/gm, function() {
               return '/nbextensions/jupytergraffiti';
             }))
             .pipe(gulp.dest(paths.pipMoveStyles.dest));
}

gulp.task('prebuild', gulp.parallel(main,jsFiles,pipMain,pipJsFiles));


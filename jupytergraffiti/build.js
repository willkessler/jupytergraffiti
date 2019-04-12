// Require js optimizer
({
    // build folder is created by a gulp task. it's the transpiled version of src.
    baseUrl: "build",
    name: "main",
    paths: {
        // These are available in jupyter environment, we can ignore it when bundling local js files
        "base": "empty:",
        "components/marked": "empty:",
        "notebook/js": "empty:"
    },
    out: "graffiti-dist/graffiti.js",
    findNestedDependencies: true,
    // Useful in dev
    // optimize: "none",
    optimize: "uglify2",
    uglify2: {
        mangle: false
    },
    onBuildWrite: function (moduleName, path, contents) {
        // Requirejs optimizer gives a module name("main") to entrypoint file which doesn't work in Jupyter environment
        return contents.replace("define('main'", "define('nbextensions/graffiti-dist/graffiti'");
    },
});

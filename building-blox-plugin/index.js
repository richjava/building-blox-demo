'use strict';
var BuildingBloxPlugin = (function () {
    const write = require('write-data');
    const path = require('path');
    const fs = require('fs')
    const axios = require('axios');

    const projectRoot = path.join(__dirname, '../')
    const templatesPath = `${projectRoot}src/templates/pages`
    const dataPath = `${projectRoot}data`;

    const globalData = {};
    // const info = chalk.keyword('lightblue')
    // const success = chalk.keyword('lightgreen')

    console.log('template path:', templatesPath)

    function BuildingBloxPlugin(options, mode) {
        if (options === void 0) {
            throw new Error(`Please provide 'options' for the CreateFilePlugin config`);
        }

        if (!options.path) {
            throw new Error("Please provide 'path' in config object");
        }

        if (!options.fileName) {
            throw new Error("Please provide 'fileName' in config object");
        }

        if (!options.apiEndpoint) {
            throw new Error("Please provide 'apiEndpoint' in config object");
        }

        if (!options.apiKey) {
            throw new Error("Please provide 'apiKey' in config object");
        }

        this.options = options;
        this.mode = mode;
    }

    /**
     * Get the data ready for templating.
     * Data is retrieved from all files kept in the data directory.
     */
    async function init() {
        return new Promise((resolve, reject) => {
            fs.readdir(dataPath, (err, files) => {
                if (err) reject(err)
                let dataArray = []
                files.forEach(file => {
                    let content = require(`${dataPath}/${file}`)
                    if (file === 'db.json') {
                        content = { db: content }
                    }
                    dataArray.push(content)
                })
                resolve(dataArray)
            })
        }).then(dataArray => {
            // globalData.jen = dataArray.reduce(function (result, current) {
            //   return Object.assign(result, current)
            // }, {})
            let pageData = {
                page: {},
                item: {},
                pagination: {}
            }
            let projectData = dataArray.reduce(function (result, current) {
                return Object.assign(result, current)
            }, {});
            globalData.blox = { ...pageData, ...projectData };
            console.log('globalData:', console.log(JSON.stringify(globalData)))
        })
    }

    function _createFile(options, mode) {
        return async () => {
            if (mode === 'production') {
                const fullPath = path.join(options.path, options.fileName);
                let data = await loadData(options);
                await write.sync(fullPath, data);
            }
        }
    }

    /**
      * Get pages.
      * Pages are folders within the templates directory.
      * @param {String} dir
      */
    function getPages(dir) {
        return fs.readdirSync(dir).filter(function (file) {
            return fs.statSync(path.join(dir, file)).isDirectory()
        })
    }

    function isMaster(dir) {
        return fs.readdirSync(dir).find(function (file) {
            return fs.statSync(path.join(dir, file)) === 'detail';
        })
    }

    function loadData(options) {
        return new Promise((resolve, reject) => {
            let dataUrl = `${options.apiEndpoint}?apikey=${options.apiKey}`;
            axios
                .get(dataUrl)
                .then((response) => {
                    resolve(response.data);
                })
                .catch(function (error) {
                    reject(error)
                })
        });
    }

    BuildingBloxPlugin.prototype.apply = function (compiler) {
        const createFile = () => _createFile(this.options, this.mode);

        if (!!compiler.hooks) {
            compiler.hooks.done.tap('CreateFileWebpack', createFile());
        } else {
            compiler.plugin('done', createFile());
        }
    };

    return BuildingBloxPlugin;
})();

module.exports = BuildingBloxPlugin;
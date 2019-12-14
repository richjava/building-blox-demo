const BrowserSyncPlugin = require('browser-sync-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// const NunjucksWebpackPlugin = require('nunjucks-webpack-plugin');
// const NunjucksWebpackPlugin = require('nunjucks-isomorphic-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const StyleLintPlugin = require('stylelint-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const fs = require('fs')
const path = require('path');
const glob = require('glob');

const BuildingBloxPlugin = require('./building-blox-plugin')

const env = process.env.NODE_ENV

const config = {
  mode: env || 'development'
}
console.log('-----', config.mode)


//const nunjuckspages = require('./nunjuckspages');

//nunjucksContext.config = (isDev) ? nunjucksDevConfig : nunjucksProdConfig;
//nunjucksContext.db = dbData;



//---------refactor into lib-------------//
class BloxLib {
  page = {};
  pages = [];
  folders = [];
  entry = {};
  itemsPerPage;
  context;

  projectRoot = path.join(__dirname, './')
  templatesPath = `${this.projectRoot}src/templates/pages`
  dataPath = `${this.projectRoot}data`;
  db = require('./data/db.json');
  data = this.data;

  sassPattern = /\.(sa|sc|c)ss$/;
  jsPattern = /\.js$/;

  defaultEntryPaths = [
    // "./src/assets/scss/generated/features.scss",
    "./src/assets/js/main.js"
  ];
  defaultItemsPerPage = 50;

  constructor(options = {}) {
    this.entryPaths = options.entryPaths ? options.entryPaths : this.defaultEntryPaths;
    this.itemsPerPage = options.itemsPerPage ? options.itemsPerPage : this.defaultItemsPerPage;
    this.data = options.data || {};
  }

  createContext() {
    return {
      blox: {
        db: this.db,
        page: {},
        ...this.data
      }
    };
  }


  /**
   * Get Page folders.
   * Pages are folders within the templates directory.
   * @param {String} dir
   */
  getPageFolders(dir) {
    return new Promise((resolve) => {
      let pageFolders = fs.readdirSync(dir).filter(function (file) {
        return fs.statSync(path.join(dir, file)).isDirectory()
      })
      resolve(pageFolders);
    });
  }

  createEntryPaths(folder) {
    let newEntryPaths = [...this.entryPaths];
    const entryPath = `./src/assets/scss/generated/${folder}.scss`;
    newEntryPaths.push(entryPath);
    this.entry[folder] = newEntryPaths;
    return newEntryPaths;
  }

  /**
  * Process the templates to generate pages.
  */
  async processTemplates() {
    let self = this;
    return new Promise(async (resolve) => {
      for (let i = 0; i < self.folders.length; i++) {
        const folder = self.folders[i]
        // self.entry = {};
        let folderPath = self.templatesPath + '/' + folder;
        self.entry[folder] = self.createEntryPaths(folder);
        // let newEntryPaths = [...self.entryPaths];
        // const entryPath = `./src/assets/scss/generated/${folder}.scss`;
        // newEntryPaths.push(entryPath);
        // self.entry[folder] = newEntryPaths;
        let entryConfig = await self.processEntryPoint(folder, `${folder}/${folder}`, folderPath);

        let subfolders = await self.getPageFolders(self.templatesPath + '/' + folder)
        let isMasterDetail = false;
        // find a subfolder with the name "detail"
        for (let i = 0; i < subfolders.length; i++) {
          let subfolder = subfolders[i]
          if (subfolder === 'detail') {
            let detailPath = path.join(self.templatesPath, folder, subfolder)
            if (self.context.blox.db[folder] && self.context.blox.db[folder].items) {
              await self.generatePage(folder, folderPath, entryConfig);
              await self.generateDetailPages(folder, entryConfig);
              isMasterDetail = true;
              break;
            }
          }
        }
        if (!isMasterDetail) {
          await self.generatePage(folder, folderPath, entryConfig);
        }
      }
      resolve()
    });
  }

  /**
     * Generate a page.
     * A page is a folder with an index file within the public folder.
     * @param {String} folder 
     * @param {String} folderPath 
     * @param {Object} entryConfig 
     */
  async generatePage(folder, folderPath, entryConfig) {
    console.log('generate page:', folder)
    console.log('generate page, entryConfig:', entryConfig)
    let self = this;
    return new Promise((resolve) => {
      self.context = self.createContext();
      let newPage = {
        name: folder,
        title: self.context.blox.db[folder] ? self.context.blox.db[folder].contentType.pluralName : '',
        rootPage: folder,
        path: folder === 'home' ? '' : '../',
        ...entryConfig,
      }

      self.context.page = newPage;
      self.context.db = self.db;
      let page = new HtmlWebpackPlugin({
        blox: self.context,
        filename: folder === 'home' ? 'index.html' : `${folder}/index.html`,
        template: `src/templates/pages/${folder}/${folder}.njk`,
        cache: false,
        inject: false
      })
      self.pages.push(page);
      resolve();
    });
  }

  getPages(options, mode) {
    let self = this;
    return new Promise(async (resolve) => {
      this.folders = await this.getPageFolders(this.templatesPath);
      self.processTemplates()
        .then(() => {
          resolve(self.pages);
        });
      // const pages = glob.sync('**/!(*detail).njk', {
      //   cwd: path.join(__dirname, 'src/templates/pages/'),
      //   root: '/',
      // }).map(page =>
      //   new HtmlWebpackPlugin({
      //     test: "...test",
      //     filename: page === 'index.njk' ? page.replace('njk', 'html') : path.join(path.basename(page.replace('njk', 'html'), '.html'), 'index.html'),
      //     // filename: page.replace('njk', 'html'),
      //     template: `src/templates/pages/${page}`,
      //   }));

    });
  }

  /**
   * Generate a pagination page.
   * @param {Object} paginationOptions 
   */
  generatePaginationPage(paginationOptions, entryConfig) {
    let self = this;
    return new Promise(async function (resolve, reject) {
      let folderPath = paginationOptions.templatesPath + '/' + paginationOptions.folder;
      let i = paginationOptions.index;
      if (i === 0 || i === (paginationOptions.currentPage - 1) * self.itemsPerPage) {
        let offset = i === 0 ? 0 : (paginationOptions.currentPage - 1) * self.itemsPerPage;
        self.context = self.createContext();
        let newPage = {
          name: paginationOptions.folder,
          title: self.context.blox.db[paginationOptions.folder].contentType.pluralName,
          rootPage: paginationOptions.folder,
          path: '../../',
          ...entryConfig,
          pagination: {
            currentPage: paginationOptions.currentPage,
            total: paginationOptions.noOfItems,
            itemsPerPage: self.itemsPerPage,
            offset: offset
          }
        }
        self.context.page = newPage;
        self.context.db = self.db;
        let page = new HtmlWebpackPlugin({
          blox: self.context,
          filename: `${paginationOptions.folder}/page-${paginationOptions.currentPage}/index.html`,
          template: `src/templates/pages/${paginationOptions.folder}/${paginationOptions.folder}.njk`,
          cache: false,
          inject: false
        })

        self.pages.push(page);
        resolve();
      } else {
        resolve();
      }
    })
  }

  // /**
  //    * Check if a folder contains files matching a regular expression.
  //    * @param {String} path
  //    */
  // async checkHasScripts(path) {
  //   return new Promise(function (resolve, reject) {
  //     // fs.readdir(path, (err, files) => {
  //     //   if (err) reject(err)
  //     //   for (let k = 0; k < files.length; k++) {
  //     //     if (files[k].startsWith('_') && files[k].endsWith('.js')) {
  //     //       resolve(true)
  //     //     }
  //     //   }
  //     //   resolve(false)
  //     // })

  //     let jsFiles = fs.readdirSync(path).filter(function (file) {
  //       console.log('checking file, match--->', file.match(/.*\.js$/))
  //       return file.match(/.*\.js$/);
  //     });
  //     console.log('resolving:' + path, jsFiles)
  //     resolve(jsFiles.length > 0);
  //   })
  //   // .then(function (hasScripts) {
  //   //   return hasScripts
  //   // })
  // }


  contains(path, pattern) {
    return new Promise(function (resolve, reject) {
      let files = fs.readdirSync(path).filter(function (file) {
        console.log('checking file, match--->', pattern)
        return file.match(pattern);
      });
      console.log('resolving:' + path, files)
      resolve(files.length > 0);
    })
  }


  /**
   * Generate the detail pages.
   * @param {String} folder 
   * @param {String} subfolder 
   */
  async generateDetailPages(folder, entryConfig) {
    let self = this;
    return new Promise(async (resolve) => {
      const folderPath = path.join(self.templatesPath, folder, 'detail')
      //let detailEntryConfig = await self.processEntryPoint(`${folder}-detail`, `${folder}/detail`, folderPath);
      let items = self.context.blox.db[folder].items;
      //let folderPath = self.templatesPath + '/' + folder;
      self.entry[`${folder}-detail`] = self.createEntryPaths(`${folder}-detail`);
      let detailEntryConfig = await self.processEntryPoint(`${folder}-detail`, `${folder}/detail/${folder}-detail`, folderPath);

      let currentPage = 1;
      for (let i = 0; i < items.length; i++) {
        let item = items[i];
        if (!item.slug) {
          throw new Error('Blox: All items must have a slug');
        }
        self.context = self.createContext();
        let newPage = {
          name: `${folder}-detail`,
          title: item.title,
          rootPage: folder,
          path: '../../',
          item: item,
          ...detailEntryConfig
        }

        self.context.page = newPage;

        self.context.db = self.db;
        currentPage = Math.ceil((i + 1) / self.itemsPerPage);
        let paginationOptions = {
          folder: folder,
          templatesPath: self.templatesPath,
          noOfItems: items.length,
          currentPage: currentPage,
          index: i
        };

        let page = new HtmlWebpackPlugin({
          blox: self.context,
          filename: `${folder}/${item.slug}/index.html`,
          template: `src/templates/pages/${paginationOptions.folder}/detail/${paginationOptions.folder}-detail.njk`,
          cache: false,
          inject: false
        })

        self.pages.push(page);
        // console.log('---------------------->>',JSON.stringify(page))
        await self.generatePaginationPage(paginationOptions, entryConfig)
      }
      resolve();
    });
  }

  async processEntryPoint(folder, folderPath, basePath) {
    let self = this;
    let [hasScripts, hasStyles] = await Promise.all([
      await self.contains(basePath, self.jsPattern),//new RegExp('/'+ folder + '.js+$/i')),
      await self.contains(basePath, self.sassPattern)
    ])
    if (hasScripts) {
      self.entry[folder].push(`./src/templates/pages/${folderPath}.js`);
    }
    if (hasStyles) {
      //  self.entry[folder].push(`./src/templates/pages/${folder}/_${folder}.scss`);
    }
    return { hasScripts: hasScripts, hasStyles: hasStyles };
  }
  /**
       * Get the data ready for templating.
       * Data is retrieved from all files kept in the data directory.
       */
  // async init() {
  //   let self = this;
  //   return new Promise(async (resolve, reject) => {

  //     this.folders = await this.getPageFolders(this.templatesPath);
  //     fs.readdir(self.dataPath, (err, files) => {
  //       if (err) reject(err)
  //       let dataArray = []
  //       files.forEach(file => {
  //         let content = require(`${self.dataPath}/${file}`)
  //         if (file === 'db.json') {
  //           content = { db: content }
  //         }
  //         dataArray.push(content)
  //       })
  //       resolve(dataArray)
  //     })
  //   }).then(dataArray => {
  //     let pageData = {
  //       page: {},
  //       item: {},
  //       pagination: {}
  //     }
  //     let projectData = dataArray.reduce(function (result, current) {
  //       return Object.assign(result, current)
  //     }, {});
  //     self.data.blox = { ...pageData, ...projectData };
  //   })
  // }

  getContext() {
    return this.context;
  }

  getEntry() {
    return this.entry;
  }
}



//---------end refactor into lib-------------//


// const pages = glob.sync('**/!(*detail).njk', {
//   cwd: path.join(__dirname, 'src/templates/pages/'),
//   root: '/',
// }).map(page => new HtmlWebpackPlugin({
//   test: "...test",
//   filename: page === 'index.njk' ? page.replace('njk', 'html') : path.join(path.basename(page.replace('njk', 'html'), '.html'), 'index.html'),
//   // filename: page.replace('njk', 'html'),
//   template: `src/templates/pages/${page}`,
// }));






var appyayOpts = {
  // path to folder in which the file will be created
  apiEndpoint: 'https://api.appyay.com/cd/v1/environments/5d2715de3f2b6f0718952e4a/export',
  apiKey: 'JRIE23SQJ5OSGRR6I43GEM26OQZUYIZSOZRT4RLJMJNCUW3OEZGA',
  path: './data',
  fileName: 'db.json'
};

let appyay = {};
let setUpApi = function (env) {
  if (env.dev) {
    appyay.baseUrl = 'https://api.appyay.com/cd/v1/environments/5d2715de3f2b6f0718952e4a/items?apikey=JRIE23SQJ5OSGRR6I43GEM26OQZUYIZSOZRT4RLJMJNCUW3OEZGA';
  }
  if (env.prod) {
    appyay.baseUrl = 'https://api.appyay.com/cd/v1/environments/5d2715de3f2b6f0718952e4a/items?apikey=JRIE23SQJ5OSGRR6I43GEM26OQZUYIZSOZRT4RLJMJNCUW3OEZGA';
  }
};


module.exports = async (env, argv) => {
  const blox = new BloxLib({
    itemsPerPage: 2
  });
  // await blox.init();
  const pages = await blox.getPages();
  const entry = blox.getEntry();
  console.log('....entry:', JSON.stringify(entry))
  //  console.log('---------------------->>',JSON.stringify(pages))
  // pages.forEach(page => {
  //   console.log('------------------------------------------>>>>page:::', JSON.stringify(page))
  // });

  const nunjucksDevConfig = require('./config/config.dev.json');
  const nunjucksProdConfig = require('./config/config.prod.json');

  // let context = JSON.stringify(blox.getContext());

  // console.log('>>>>>>>>>>>>>>>>>>>>>CONTEXT', context)

  // const nunjucksOptions = JSON.stringify({
  //   searchPaths: path.join(__dirname, 'src/templates/'),
  //   context: context
  // });

  // const devMode = !env || !env.production;
  console.log('---->argv mode', argv.mode)
  console.log('---->entry', entry)
  return {
    mode: argv.mode,
    entry: entry,
    // entry: {
    //   features: ["./src/templates/pages/features/_features.js", "./src/templates/pages/features/_features.scss", "./src/templates/pages/docs/_docs.scss"],
    //   docs: ["./src/templates/pages/features/_features.js", "./src/templates/pages/features/_features.scss", "./src/templates/pages/docs/_docs.scss"],
    //   // home: ["./src/templates/pages/home/_home.js", "./src/templates/pages/home/_home.scss", "./src/templates/pages/docs/_docs.scss"],
    // },
    // entry: {
    //   main: './src/index.js',
    //   typescript_demo: './src/typescript_demo.ts',
    //   vendor: './src/vendor.js'
    // },
    devServer: {
      contentBase: './src',
      open: true
    },
    // output: {
    //   path: path.join(__dirname, 'dist'),
    //   filename: 'assets/js/[name].js',
    //   library: 'MainModule',
    // },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: 'assets/js/[name].js'
    },
    module: {
      rules: [
        {
          test: /\.njk$/,
          use: [
            {
              loader: `nunjucks-isomorphic-loader`,
              query: {
                root: [path.resolve(__dirname, './src/templates')]
              }
            }
          ]
        },
        {
          test: /\.(sa|sc|c)ss$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader',
            {
              loader: "sass-loader", options: {
                sassOptions: {
                  sourceMap: true,
                  data: '@import "/assets/main";',
                  includePaths: [
                    path.join(__dirname, 'src')
                  ]
                }
              }
            }
          ]
        },

        // {
        //   test: /\.(sa|sc|c)ss$/,
        //   use: [
        //     MiniCssExtractPlugin.loader,
        //     'css-loader',
        //     'postcss-loader',
        //     {
        //       loader: 'sass-loader',
        //       options:
        //       {
        //         sassOptions: {
        //           includePaths: [
        //             "./src/templates/layout/header.scss",
        //             "./src/templates/layout/footer.scss"
        //           ]
        //         }
        //       }
        //     }
        //   ]
        // },
        {
          test: /\.ts(x?)$/,
          enforce: 'pre',
          exclude: /node_modules/,
          use: [
            {
              loader: 'tslint-loader',
              options: { /* Loader options go here */ }
            }
          ]
        },
        {
          test: /\.ts(x?)$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'babel-loader',
              query: {
                presets: [
                  '@babel/preset-env'
                ]
              }
            },
            {
              loader: 'ts-loader'
            }
          ]
        },
        {
          enforce: 'pre',
          test: /\.js$/,
          exclude: /node_modules/,
          loader: 'eslint-loader'
        },
        {
          test: /\.js$/,
          loader: 'babel-loader',
          query: {
            presets: [
              '@babel/preset-env'
            ]
          }
        },
        {
          test: /\.(png|jpg|gif)$/i,
          use: [
            {
              loader: 'url-loader',
              options: {
                limit: 8192
              }
            }
          ]
        },
        {
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
          use: [{
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'fonts/'
            }
          }]
        },
        // {
        //   test: /\.(njk|nunjucks)$/,
        //   use: [
        //     {
        //       loader: 'nunjucks-isomorphic-loader'
        //     }
        //   ]
        // }

      ]
    },
    stats: {
      colors: true
    },
    devtool: 'source-map',
    plugins: [
      ...pages,
      // new HtmlWebpackPlugin({
      //   customData: { foo: 'bar' },
      //   filename: 'home.html',
      //   template: './src/templates/pages/home/home.njk'
      // }),
      // new HtmlWebpackPlugin({
      //   customData: { foo: 'bar!!!!!' },
      //   filename: 'index.html',
      //   template: './src/templates/index.njk'
      // }),
      new MiniCssExtractPlugin({
        filename: 'assets/css/[name].css'
      }),
      // new BuildingBloxPlugin(opts),
      // new StyleLintPlugin(),
      new BrowserSyncPlugin({
        host: 'localhost',
        port: 3000,
        server: { baseDir: ['dist'] }
      }),
      new ExtraWatchWebpackPlugin({
        dirs: ['templates']
      }),
      new CopyWebpackPlugin([
        // copyUmodified is true because of https://github.com/webpack-contrib/copy-webpack-plugin/pull/360
        { from: 'assets/**/*', to: '.' }
      ], { copyUnmodified: true }),
      new CleanWebpackPlugin()
    ],
    optimization: {
      minimizer: [
        new UglifyJsPlugin({
          sourceMap: true,
          parallel: true
        }),
        new OptimizeCSSAssetsPlugin({
          cssProcessorOptions: {
            map: {
              inline: false
            }
          }
        })
      ]
    }
  };
};

const BrowserSyncPlugin = require('browser-sync-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const NunjucksWebpackPlugin = require('nunjucks-webpack-plugin');
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
  pages = [];
  projectRoot = path.join(__dirname, './')
  templatesPath = `${this.projectRoot}src/templates/pages`
  dataPath = `${this.projectRoot}data`;
  folders = [];
  options = {};
  context;

  DEFAULT_ITEMS_PER_PAGE = 50;

  constructor(options = {}) {
    this.options = options;
    if (!this.options.itemsPerPage) {
      this.options.itemsPerPage = this.DEFAULT_ITEMS_PER_PAGE;
    }
    this.context = {
      blox: {
        db: require('./data/db.json'),
        page: {}
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

  /**
* Process the templates to generate pages.
*/
  async processTemplates() {
    let self = this;
    return new Promise(async (resolve) => {
      for (let i = 0; i < self.folders.length; i++) {
        const folder = self.folders[i]
        let subfolders = await self.getPageFolders(self.templatesPath + '/' + folder)
        let isMasterDetail = false;
        // find a subfolder with the name "detail"
        for (let i = 0; i < subfolders.length; i++) {
          let subfolder = subfolders[i]
          if (subfolder === 'detail') {
            let detailPath = path.join(self.templatesPath, folder, subfolder)
            if (self.context.blox.db[folder].items) {
              await self.generateDetailPages(folder)
              isMasterDetail = true;
              break;
            }
          }
        }
        if (!isMasterDetail) {
          let folderPath = self.templatesPath + '/' + folder
          let [hasScripts] = await Promise.all([
            await self.checkHasScripts(folderPath)
            // checkHasPartial(folderPath)
          ])
          await self.generatePage(folder, folderPath, hasScripts);
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
     * @param {Boolean} hasScripts 
     */
  async generatePage(folder, folderPath, hasScripts) {
    let self = this;
    return new Promise((resolve) => {
      let newPage = {
        name: folder,
        hasScripts: hasScripts,
      }
      self.context.blox.page = {...newPage, ...self.context.blox.page}
      let page = new HtmlWebpackPlugin({
        ...self.context,
        filename: `${folder}/index.html`,
        template: `src/templates/pages/${folder}/${folder}.njk`,
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
        })
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
  generatePaginationPage(paginationOptions) {
    let self = this;
    return new Promise(async function (resolve, reject) {
      let folderPath = paginationOptions.templatesPath + '/' + paginationOptions.folder;
      let hasScripts = await self.checkHasScripts(folderPath)
      let i = paginationOptions.index;
      if (i === 0 || i === (paginationOptions.currentPage - 1) * self.options.itemsPerPage) {
        let offset = i === 0 ? 0 : (paginationOptions.currentPage - 1) * self.options.itemsPerPage;
        let newPage = {
          name: paginationOptions.folder,
          hasScripts: hasScripts,
          pagination: {
            currentPage: paginationOptions.currentPage,
            total: paginationOptions.noOfItems,
            itemsPerPage: self.options.itemsPerPage,
            offset: offset
          }
        }
        self.context.blox.page = {...newPage, ...self.context.blox.page};
        let page = new HtmlWebpackPlugin({
          ...self.context,
          filename: `${paginationOptions.folder}/page-${paginationOptions.currentPage}/index.html`,
          template: `src/templates/pages/${paginationOptions.folder}/${paginationOptions.folder}.njk`,
        })
        console.log('----page', JSON.stringify(page))
        self.pages.push(page);
        resolve();
      } else {
        resolve();
      }
    })
  }

  /**
     * Check if a folder contains script files.
     * Used to set up the inlining of page-scoped scripts.
     * @param {String} path
     */
  async checkHasScripts(path) {
    return new Promise(function (resolve, reject) {
      fs.readdir(path, (err, files) => {
        if (err) reject(err)
        for (let k = 0; k < files.length; k++) {
          if (files[k].startsWith('_') && files[k].endsWith('.js')) {
            resolve(true)
          }
        }
        resolve(false)
      })
    }).then(function (hasScripts) {
      return hasScripts
    })
  }
  // }

  /**
   * Generate the detail pages.
   * @param {String} folder 
   * @param {String} subfolder 
   */
  async generateDetailPages(folder) {
    console.log('generate detail')
    let self = this;
    return new Promise(async (resolve) => {
      // pageType = 'detail';
      const folderPath = path.join(self.templatesPath, folder, 'detail')
      let hasScripts = await self.checkHasScripts(folderPath)
      let items = self.context.blox.db[folder].items;
    
      let currentPage = 1;
      for (let i = 0; i < items.length; i++) {
        console.log('generate detail, item', i)
        let item = items[i];
        if (!item.slug) {
          throw new Error('Blox: All items must have a slug');
        }
        let newPage = {
          name: `${folder}-detail`,
          hasScripts: hasScripts,
          item: item
        }
        self.context.blox.page = {...newPage, ...self.context.blox.page};
        currentPage = Math.ceil((i + 1)/self.options.itemsPerPage);
        let paginationOptions = {
          folder: folder,
          templatesPath: self.templatesPath,
          noOfItems: items.length,
          currentPage: currentPage,
          index: i
        };

        let page = new HtmlWebpackPlugin({
          ...self.context,
          filename: `${folder}/${item.slug}/index.html`,
          template: `src/templates/pages/${paginationOptions.folder}/${paginationOptions.folder}.njk`,
        })
        self.pages.push(page);
        
        await self.generatePaginationPage(paginationOptions)
      }
      console.log('generate detail, pages', self.pages)
      resolve();
    });
  }
  /**
       * Get the data ready for templating.
       * Data is retrieved from all files kept in the data directory.
       */
  // async init() {
  //   console.log('1..')
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

  getData() {
    return this.context;
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
  // console.log('--------------pages', JSON.stringify(pages));

  const nunjucksDevConfig = require('./config/config.dev.json');
  const nunjucksProdConfig = require('./config/config.prod.json');

  let context = blox.getData();
  context.blox.config = (argv.mod === 'development') ? nunjucksDevConfig : nunjucksProdConfig;

  const nunjucksOptions = JSON.stringify({
    searchPaths: path.join(__dirname, 'src/templates/'),
    context: context
  });

  // const devMode = !env || !env.production;
  console.log('---->argv mode', argv.mode)
  return {
    mode: argv.mode,
    entry: {
      main: './src/index.js',
      typescript_demo: './src/typescript_demo.ts',
      vendor: './src/vendor.js'
    },
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
          test: /\.(sa|sc|c)ss$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader',
            'sass-loader'
          ]
        },
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
        {
          test: /\.(njk|nunjucks)$/,
          loader: ['html-loader', `nunjucks-html-loader?${nunjucksOptions}`]
        },
      ]
    },
    stats: {
      colors: true
    },
    devtool: 'source-map',
    plugins: [
      ...pages,
      // new webpack.DefinePlugin({
      //   'process.env.appyay': JSON.stringify(appyay)
      // }),
      //(devMode === 'production') && new BuildingBloxPlugin(opts),
      new BuildingBloxPlugin(appyayOpts, argv.mode),
      //...(argv.mode !== 'production' ? [] : [new BuildingBloxPlugin(appyayOpts, argv.mode)]),
      new MiniCssExtractPlugin({
        filename: 'assets/css/[name].css'
      }),
      // new BuildingBloxPlugin(opts),
      new MiniCssExtractPlugin({
        filename: 'assets/css/[name].css'
      }),
      // new StyleLintPlugin(),
      // new BrowserSyncPlugin({
      //   host: 'localhost',
      //   port: 3000,
      //   server: { baseDir: ['dist'] }
      // }),
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

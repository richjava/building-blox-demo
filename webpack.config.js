const BrowserSyncPlugin = require('browser-sync-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const StyleLintPlugin = require('stylelint-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const fs = require('fs')
const path = require('path');
const glob = require('glob');

const BuildingBloxPlugin = require('./building-blox-plugin');

const env = process.env.NODE_ENV

const config = {
  mode: env || 'development'
}

//---------refactor into lib-------------//
var yaml = require('js-yaml');

class BloxLib {
  page = {};
  pages = [];
  pageNames = [];
  entry = {};
  blockUtilConfig = {};
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
   * Get directory names (Blocks are directories within the templates directory).
   * @param {String} dir
   */
  getDirectories(dir) {
    return new Promise((resolve) => {
      let directories = fs.readdirSync(dir).filter(function (file) {
        return fs.statSync(path.join(dir, file)).isDirectory()
      })
      resolve(directories);
    });
  }

  createEntryPaths(blockName) {
    let newEntryPaths = [...this.entryPaths];
    const entryPath = `./src/assets/scss/generated/${blockName}.scss`;
    newEntryPaths.push(entryPath);
    this.entry[blockName] = newEntryPaths;
    return newEntryPaths;
  }

  async connectPageLocalBlocks(pageName, pagePath, blockType) {
    let self = this;
    console.log('--->>page name' + pageName + ',' + blockType)
    return new Promise(function (resolve, reject) {
      let blockPath = `${self.projectRoot}/src/templates/pages${pagePath}${blockType}/`;
      fs.stat(blockPath, async function (err, stat) {
        if (err == null) {
          var dirs = fs.readdirSync(blockPath, []);
          if (dirs) {
            for (let i = 0; i < dirs.length; i++) {
              let blockName = dirs[i];
              console.log(JSON.stringify(self.blockUtilConfig))
              self.blockUtilConfig[pageName].sass += self.getSassContent(
                pageName,
                `${blockName} block of ${pageName} page`,
                `/pages${pagePath}${blockType}/${blockName}/${blockName}`
              );
              await self.processEntryPoint(pageName, `./src/templates/pages${pagePath}${blockType}/${blockName}/${blockName}`, `${blockPath}${blockName}`)
            }
            resolve()
          }
        } else if (err.code === 'ENOENT') {
          resolve()
        } else {
          resolve()
        }
      });
    })
  }

  async connectGlobalBlocks(blocks, pageName, blockPath) {
    let basePath = `${this.projectRoot}/src/templates${blockPath}`;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      this.blockUtilConfig[pageName].sass += this.getSassContent(
        pageName,
        `global ${block.name} block of ${pageName} page`,
        `/${blockPath}/${block.name}/${block.name}`);
      await this.processEntryPoint(pageName, `./src/templates${blockPath}/${block.name}/${block.name}`, `${basePath}/${block.name}`)
    }
    // let basePath = `${this.projectRoot}/src/templates/${blockType}/`;
    // for (let i = 0; i < blocks.length; i++) {
    //   const block = blocks[i];
    //   this.blockUtilConfig[pageName].sass += this.getSassContent(
    //     pageName,
    //     `global ${block.name} block of ${pageName} page`,
    //     `${blockType}/${block.name}/${block.name}`);
    //   await this.processEntryPoint(pageName, `./src/templates/${blockType}/${blockPath}/${block.name}/${block.name}`, `${basePath}${block.name}`)
    // }
  }

  getSassContent(pageName, forText, pathText) {
    return `\n\n/************\nAuto-generated Sass for ${forText}\n*************/\n@import "../../../templates${pathText}";`;
  }

  async connectPageGlobalBlocks(blockConfig) {
    // let blockName = blockConfig.pageName;
    // this.connectGlobalBlocks(blockConfig.partials, blockConfig.pageName, `/${blockName}/${blockName}`, 'partials');
    // this.connectGlobalBlocks(blockConfig.components, blockConfig.pageName, `/${blockName}/${blockName}`, 'components');
    // let sets = blockConfig.sets;
    // for (let i = 0; i < sets.length; i++) {
    //   const set = blockConfig.sets[i];
    //   this.connectGlobalBlocks(set.components, blockName, `/${set.name}/${blockName}/${blockName}`, 'components');
    // }
    console.log('block config:', JSON.stringify(blockConfig))
    this.connectGlobalBlocks(blockConfig.partials, blockConfig.pageName, '/partials');
    this.connectGlobalBlocks(blockConfig.components, blockConfig.pageName, 'components');
    let sets = blockConfig.sets;
    for (let i = 0; i < sets.length; i++) {
      const set = blockConfig.sets[i];
      this.connectGlobalBlocks(set.components, blockConfig.pageName, `/sets/${set.name}`);
    }
  }

  createBlockUtilConfig() {
    return {
      sass: '@import "../index";\n@import "../../../templates/layout/layout";\n',
      hasScripts: false
    }
  }

  async connect(pageName, pagePath, sassConfig){

    //connect page Sass
    this.blockUtilConfig[pageName].sass += this.getSassContent(
      pageName,
      sassConfig.forText,
      sassConfig.pathText
    );

    //connect page-scoped partial and component blocks
    await this.connectPageLocalBlocks(pageName, pagePath, 'partials');
    await this.connectPageLocalBlocks(pageName, pagePath, 'components');

    //connect blocks that have global (project-level) scope
    let blockConfig = await this.getBlockConfig(pageName);
    await this.connectPageGlobalBlocks(blockConfig);

    //write Sass imports to generated page Sass file
    fs.writeFileSync(`${this.projectRoot}/src/assets/scss/generated/${pageName}.scss`,
      this.blockUtilConfig[pageName].sass, null, 4);
  }

  /**
  * Process the templates to generate pages.
  */
  async processTemplates() {
    let self = this;
    return new Promise(async (resolve) => {
      for (let i = 0; i < self.pageNames.length; i++) {
        const pageName = self.pageNames[i]
        let pagePath = self.templatesPath + '/' + pageName;

        self.entry[pageName] = self.createEntryPaths(pageName);
        let entryConfig = await self.processEntryPoint(pageName, `./src/templates/pages/${pageName}/${pageName}`, pagePath);
        self.blockUtilConfig[pageName] = self.createBlockUtilConfig();
        self.blockUtilConfig[pageName].hasScripts = entryConfig.hasScripts;
        await self.generatePage(pageName, entryConfig);
        await self.connect(
          pageName,
          `/${pageName}/`,
          {
            forText: `${pageName} page`, 
            pathText: `/pages/${pageName}/${pageName}`
          });

        //process master-detail pattern

        let subDirs = await self.getDirectories(self.templatesPath + '/' + pageName)
        let isMasterDetail = false;
        // find a subfolder with the name "detail"
        for (let i = 0; i < subDirs.length; i++) {
          let subDir = subDirs[i]
          if (subDir === 'detail') {
            let detailPath = path.join(self.templatesPath, pageName, subDir)
            if (self.context.blox.db[pageName] && self.context.blox.db[pageName].items) {
              // await self.generatePage(pageName, entryConfig);
              await self.generateDetailPages(pageName, entryConfig);
              let detailName = `${pageName}-detail`;
              self.blockUtilConfig[detailName] = self.createBlockUtilConfig();
              await self.connect(
                detailName,
                `/${pageName}/detail/`,
                {
                  forText: `detail page of ${pageName} master page`, 
                  pathText: `/pages/${pageName}/detail/${detailName}`
                });
              isMasterDetail = true;
              break;
            }
          }
        }
        // if (!isMasterDetail) {
        //   // await self.generatePage(pageName, entryConfig);
        //   await self.connect(
        //     pageName,
        //     `/${pageName}/`,
        //     {
        //       forText: `${pageName} page`, 
        //       pathText: `pages/${pageName}/${pageName}`
        //     });
        // }
      }
      resolve()
    });
  }

  /**
     * Generate a Page.
     * A Page is a directory with an index file within the public folder.
     * @param {String} pageName 
     * @param {String} folderPath 
     * @param {Object} entryConfig 
     */
  async generatePage(pageName, entryConfig) {
    let self = this;
    return new Promise((resolve) => {
      self.context = self.createContext();
      let newPage = {
        name: pageName,
        title: self.context.blox.db[pageName] ? self.context.blox.db[pageName].contentType.pluralName : '',
        rootPage: pageName,
        path: pageName === 'home' ? '' : '../',
        ...entryConfig,
      }

      self.context.page = newPage;
      self.context.db = self.db;
      let page = new HtmlWebpackPlugin({
        blox: self.context,
        filename: pageName === 'home' ? 'index.html' : `${pageName}/index.html`,
        template: `src/templates/pages/${pageName}/${pageName}.njk`,
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
      this.pageNames = await this.getDirectories(this.templatesPath);
      self.processTemplates()
        .then(() => {
          resolve(self.pages);
        });
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

  contains(path, pattern) {
    let self = this;
    return new Promise(function (resolve, reject) {
      let files = fs.readdirSync(`${path}`).filter(function (file) {
        return file.match(pattern);
      });
      resolve(files.length > 0);
    })
  }

  getBlockConfig(pageName) {
    let self = this;
    return new Promise(function (resolve, reject) {
      const pagePath = `./src/templates/pages/${pageName}`;
      let blockConfig = {
        partials: [],
        components: [],
        sets: [],
        pageName: pageName
      };
      try {
        let file = fs.readFileSync(`${self.projectRoot}${pagePath}/${pageName}.yaml`, 'utf8');
        yaml.safeLoadAll(file, function (doc) {

          if (!doc.partials && !doc.sets && !doc.components) {
            resolve(blockConfig);
          }
          blockConfig.partials = doc.partials || [];
          blockConfig.components = doc.components || [];
          blockConfig.sets = doc.sets || [];
          resolve(blockConfig)
        });
      } catch (err) {
        resolve(blockConfig);
      }
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
      let items = self.context.blox.db[folder].items;
      let detailName = `${folder}-detail`;

      self.entry[detailName] = self.createEntryPaths(detailName);
      let detailEntryConfig = await self.processEntryPoint(detailName, `${folderPath}/${detailName}`, folderPath);
      
      let currentPage = 1;
      for (let i = 0; i < items.length; i++) {
        let item = items[i];
        if (!item.slug) {
          throw new Error('Blox: All items must have a slug');
        }
        self.context = self.createContext();
        let newPage = {
          name: detailName,
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
          template: `src/templates/pages/${folder}/detail/${detailName}.njk`,
          cache: false,
          inject: false
        })

        self.pages.push(page);
        await self.generatePaginationPage(paginationOptions, entryConfig)
      }
      resolve();
    });
  }

  async processEntryPoint(folder, folderPath, basePath) {
    let self = this;
    let hasScripts = await self.contains(basePath, self.jsPattern);
    console.log('-->processEntryPoint:' + folderPath + ', basePath: ' + basePath)
    if (hasScripts) {
      self.entry[folder].push(`${folderPath}.js`);
    }
    return { hasScripts: hasScripts };
  }
  
  getContext() {
    return this.context;
  }

  getEntry() {
    return this.entry;
  }
}

/* END REFACTOR INTO LIBRARY */


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
  const pages = await blox.getPages();
  const entry = blox.getEntry();
  console.log('....entry:', JSON.stringify(entry))

  const nunjucksDevConfig = require('./config/config.dev.json');
  const nunjucksProdConfig = require('./config/config.prod.json');
  // console.log('---->argv mode', argv.mode)
  // console.log('---->entry', entry)
  return {
    mode: argv.mode,
    entry: entry,
    devServer: {
      contentBase: './src',
      open: true
    },
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
                  // data: '@import "/assets/main";',
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

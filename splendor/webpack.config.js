const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const packageJson = require('./package.json')

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/react-index.html',
      filename: 'index.html'
    }),
    new webpack.DefinePlugin({
      'process.env.SPLENDOR_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL),
      'process.env.SPLENDOR_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY),
      'process.env.SPLENDOR_VERSION': JSON.stringify(packageJson.version)
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx']
  },
  devServer: {
    port: 3001,
    hot: true,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  mode: 'development'
}
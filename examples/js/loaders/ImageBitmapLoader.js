/**
 * @author thespite / http://clicktorelease.com/
 */

function detectCreateImageBitmap ( optionsList ) {

	var url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

	return new Promise( function ( resolve, reject ) {

		if ( ! ( 'createImageBitmap' in window ) ) {

			reject();
			return;

		}

		fetch( url ).then( function ( res ) {

			return res.blob();

		} ).then( function ( blob ) {

			var pendingImages = [];

			for ( var i = 0; i < optionsList.length; i ++ ) {

				var pendingImage = optionsList[ i ] === undefined
					? createImageBitmap( blob )
					: createImageBitmap( blob, optionsList[ i ] );

				pendingImages.push( pendingImage );

			}

			Promise.all( pendingImages ).then( function () {

				resolve();

			} ).catch( function () {

				reject();

			} );

		} );

	} );

}

var canUseImageBitmap = detectCreateImageBitmap( [ undefined ] );

var canUseImageBitmapOptions = detectCreateImageBitmap( [
	{ imageOrientation: 'none', premultiplyAlpha: 'none' },
	{ imageOrientation: 'flipY', premultiplyAlpha: 'none' },
	{ imageOrientation: 'none', premultiplyAlpha: 'premultiply' },
	{ imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' }
] );

/**
 * Self-contained worker for fetching and decoding an image, returning an
 * ImageBitmap to the main thread.
 */
var Parser = (function () {

	function Parser() {
		this.callbackBuilder = null;
		this.callbackProgress = null;
	}

	/* global self */
	Parser.prototype.parse = function ( input, options ) {
		var imageBitmapCreator = ( options === undefined )	? this.workerScope.createImageBitmap( input ) : this.workerScope.createImageBitmap( input, options );

		var scope = this;
		imageBitmapCreator.then( function ( imageBitmap ) {

			scope.callbackBuilder(
				{
					cmd: 'imageData',
					data: imageBitmap
				}
			);

		} ).catch( function ( error ) {

			var errorMessage = 'THREE.ImageBitmapWorker: ' + error;
			console.error( errorMessage );

			scope.callbackBuilder(
				{
					cmd: 'error',
					msg: errorMessage
				}
			);

		} );
	};

	return Parser;
})();

var createAbsolutePath = function ( href ) {

	if ( href.match( /(https?:)?\/\// ) ) return href;

	var link = document.createElement( 'a' );
	link.href = href;
	return link.protocol + '//' + link.host + link.pathname + link.search + link.hash;

};


THREE.ImageBitmapLoader = function ( manager ) {

	canUseImageBitmap.catch( function () {

		console.warn( 'THREE.ImageBitmapLoader: createImageBitmap() not supported.' );

	} );

	this.manager = manager !== undefined ? manager : THREE.DefaultLoadingManager;
	this.options = undefined;

};

THREE.ImageBitmapLoader.prototype = {

	constructor: THREE.ImageBitmapLoader,

	setOptions: function setOptions( options ) {

		canUseImageBitmapOptions.catch( function () {

			console.warn( 'THREE.ImageBitmapLoader: createImageBitmap() options not supported.' );

		} );

		this.options = options;
		return this;

	},

	run: function run( prepData ) {

	},

	load: function load( url, onLoad, onProgress, onError ) {

		if ( url === undefined ) url = '';

		if ( this.path !== undefined ) url = this.path + url;

		var scope = this;

		var cached = THREE.Cache.get( url );

		if ( cached !== undefined ) {

			scope.manager.itemStart( url );

			setTimeout( function () {

				if ( onLoad ) onLoad( cached );

				scope.manager.itemEnd( url );

			}, 0 );

			return cached;

		}

		var workerSupport = new THREE.LoaderSupport.WorkerSupport();
		var buildWorkerCode = function ( funcBuildObject, funcBuildSingelton ) {
			var workerCode = '';
			workerCode += '/**\n';
			workerCode += '  * This code was constructed by ImageBitmapLoader buildWorkerCode.\n';
			workerCode += '  */\n\n';
			workerCode += funcBuildSingelton( 'Parser', 'Parser', Parser );

			return workerCode;
		};
		var scopeBuilderFunc = function ( payload ) {
			var result = payload.data;
			if ( payload.data instanceof ImageBitmap ) {

				THREE.Cache.add( url, result );

				if ( onLoad ) onLoad( result );

				scope.manager.itemEnd( url );

			} else {

				if ( onError ) onError( result );

				scope.manager.itemEnd( url );
				scope.manager.itemError( url );

			}
		};
		var scopeFuncComplete = function ( message ) {
		};

		workerSupport.validate( buildWorkerCode, false );
		workerSupport.setCallbacks( scopeBuilderFunc, scopeFuncComplete );
		fetch( url ).then( function ( response ) {

			return response.blob();

		} ).then( function ( arrayBuffer ) {

			workerSupport.run(
				{
					data: {
						input: arrayBuffer,
						options: scope.options
					}
				},
				[ arrayBuffer.buffer ]
			);

		} )

	}

};

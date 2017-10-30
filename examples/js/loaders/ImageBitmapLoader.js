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
var ImageBitmapWorker = (function () {

	function ImageBitmapWorker() {
		this.callbackBuilder = null;
	}

	ImageBitmapWorker.prototype.parse = function ( input, options ) {
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
			scope.callbackBuilder(
				{
					cmd: 'error',
					msg: errorMessage
				}
			);

		} );
	};

	return ImageBitmapWorker;
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
	this.workerSupport = null;
	this.instanceNo = 0;
	this.callbacks = new THREE.LoaderSupport.Callbacks();

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

		this.workerSupport = new THREE.LoaderSupport.WorkerSupport();
		this.workerSupport.setTerminateRequested( true );
		this._execWorker( url, onLoad, onError );
	},

	run: function run( prepData, workerSupportExternal ) {
		var Validator = THREE.LoaderSupport.Validator;

		if ( Validator.isValid( workerSupportExternal ) ) {

			this.workerSupport = workerSupportExternal;

		} else {

			this.workerSupport = Validator.verifyInput( this.workerSupport, new THREE.LoaderSupport.WorkerSupport() );

		}

		this._execWorker( prepData.resources[ 0 ].url, prepData.getCallbacks().onLoad, prepData.getCallbacks().onLoad  );
	},

	_execWorker: function ( url, onLoad, onError ) {
		var scope = this;

		var buildWorkerCode = function ( funcBuildObject, funcBuildSingelton ) {
			var workerCode = '';
			workerCode += '/**\n';
			workerCode += '  * This code was constructed by ImageBitmapLoader buildWorkerCode.\n';
			workerCode += '  */\n\n';
			workerCode += funcBuildSingelton( 'Parser', 'Parser', ImageBitmapWorker );

			return workerCode;
		};
		var scopeBuilderFunc = function ( payload ) {
			var result = payload.data;
			if ( payload.data instanceof ImageBitmap ) {

				THREE.Cache.add( url, result );

				if ( onLoad ) {

					onLoad( {
						detail: {
							imageBitmap: result,
							instanceNo: scope.instanceNo
						}
					} );

				}
				scope.manager.itemEnd( url );

			} else {

				if ( onError ) onError( result );

				scope.manager.itemEnd( url );
				scope.manager.itemError( url );

			}
		};
		var scopeFuncComplete = function ( message ) {
		};

		this.workerSupport.validate( buildWorkerCode, false );
		this.workerSupport.setCallbacks( scopeBuilderFunc, scopeFuncComplete );
		fetch( url ).then( function ( response ) {

			return response.blob();

		} ).then( function ( blob ) {

			scope.workerSupport.run(
				{
					data: {
						input: blob,
						options: scope.options
					},
					logger: {
						debug: false,
						enabled: false
					},
				}
			);

		} )
	}


};

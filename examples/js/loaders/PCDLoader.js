/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br
 * @author Mugen87 / https://github.com/Mugen87
 * @author Kai Salmen / https://kaisalmen.de / https://github.com/kaisalmen
 *
 * Description: A THREE loader for PCD ascii and binary files.
 *
 * Limitations: Compressed binary files are not supported.
 *
 */

if ( THREE.LoaderSupport === undefined ) console.error( '"THREE.LoaderSupport" is not available. "THREE.PCDLoader" requires it. Please include "LoaderSupport.js" in your HTML.' );

/**
 * Use this class to load PCD data from files or to parse PCD data from an arraybuffer
 * @class
 *
 * @param {THREE.DefaultLoadingManager} [manager] The loadingManager for the loader to use. Default is {@link THREE.DefaultLoadingManager}
 */
THREE.PCDLoader = function ( manager ) {
	THREE.LoaderSupport.LoaderBase.call( this, manager );

	var PCDLOADER_VERSION = '2.0.0';
	console.info( 'Using THREE.PCDLOADER_VERSION version: ' + PCDLOADER_VERSION );

	this.littleEndian = true;
	this.workerSupport = null;

	var materials = this.builder.getMaterials();
	var defaultPointMaterial = materials[ 'defaultPointMaterial' ];
	defaultPointMaterial.color.setHex( Math.random() * 0xffffff );
};

THREE.PCDLoader.prototype = Object.create( THREE.LoaderSupport.LoaderBase.prototype );
THREE.PCDLoader.prototype.constructor = THREE.PCDLoader;

/**
 * Set if littleEndian should be used.
 *
 * @param littleEndian
 */
THREE.PCDLoader.prototype.setLittleEndian = function ( littleEndian ) {
	this.littleEndian = littleEndian === true;
};

/*
 * Load method is provided by THREE.LoaderSupport.LoaderBase.load.
 */


/**
 * Parses a PCD binary structure synchronously from given ArrayBuffer and returns a new Group containing
 * the object. It is converted to Points with a BufferGeometry and a PointsMaterial.
 * @memberOf THREE.PCDLoader
 *
 * @param {ArrayBuffer} data PCD data as Uint8Array
 */
THREE.PCDLoader.prototype.parse = function ( data ) {
	var scope = this;
	var parser = new THREE.PCDLoader.Parser();
	parser.setLittleEndian( this.littleEndian );

	var onMeshLoaded = function ( payload ) {
		var meshes = scope.builder.processPayload( payload );
		// no mesh alteration, therefore short-cut
		var mesh;
		for ( var i in meshes ) {
			mesh = meshes[ i ];
			scope.loaderRootNode.add( mesh );
		}
	};
	parser.setCallbackBuilder( onMeshLoaded );

	// parse header (always ascii format)
	parser.parse( data );

	return this.loaderRootNode;
};

/**
 * Parses a PCD binary structure asynchronously from given ArrayBuffer. Calls onLoad once loading is complete.
 * A new Group containing the object is passed to onLoad. The object is converted to Points with a BufferGeometry
 * and a PointsMaterial.
 * @memberOf THREE.PCDLoader
 *
 * @param {arraybuffer} data PCD data as Uint8Array
 * @param {callback} onLoad Called after worker successfully completed loading
 */
THREE.PCDLoader.prototype.parseAsync = function ( data, onLoad ) {
	var scope = this;
	var scopedOnLoad = function () {
		onLoad(
			{
				detail: {
					loaderRootNode: scope.loaderRootNode,
					modelName: scope.modelName,
					instanceNo: scope.instanceNo
				}
			}
		);
	};
	var scopedOnMeshLoaded = function ( payload ) {
		var meshes = scope.builder.processPayload( payload );
		var mesh;
		for ( var i in meshes ) {
			mesh = meshes[ i ];
			scope.loaderRootNode.add( mesh );
		}
	};

	this.workerSupport = THREE.LoaderSupport.Validator.verifyInput( this.workerSupport, new THREE.LoaderSupport.WorkerSupport() );
	var buildCode = function ( funcBuildObject, funcBuildSingleton ) {
		var workerCode = '';
		workerCode += '/**\n';
		workerCode += '  * This code was constructed by PCDLoader buildCode.\n';
		workerCode += '  */\n\n';
		workerCode += 'THREE = {\n\tLoaderSupport: {},\n\tPCDLoader: {}\n};\n\n';
		workerCode += funcBuildObject( 'THREE.LoaderUtils', THREE.LoaderUtils );
		workerCode += funcBuildSingleton( 'THREE.PCDLoader.Parser', THREE.PCDLoader.Parser, 'Parser' );

		return workerCode;
	};
	this.workerSupport.validate( buildCode, 'THREE.PCDLoader.Parser' );
	this.workerSupport.setCallbacks( scopedOnMeshLoaded, scopedOnLoad );
	if ( scope.terminateWorkerOnLoad ) this.workerSupport.setTerminateRequested( true );

	this.workerSupport.run(
		{
			params: {
				littleEndian: this.littleEndian
			},
			// there is currently no need to send any material properties or logging config to the Parser
			data: {
				input: data,
				options: null
			}
		}
	);
};

/**
 * Run the loader according the provided instructions. Used for batch-loading orchestrated by {THREE.LoaderSupport.WorkerDirector}
 * @memberOf THREE.PCDLoader
 *
 * @param {THREE.LoaderSupport.PrepData} prepData All parameters and resources required for execution
 * @param {THREE.LoaderSupport.WorkerSupport} [workerSupportExternal] Use pre-existing WorkerSupport
 */
THREE.PCDLoader.prototype.run = function ( prepData, workerSupportExternal ) {
	THREE.LoaderSupport.LoaderBase.prototype._applyPrepData.call( this, prepData );
	if ( workerSupportExternal !== null && workerSupportExternal !== undefined ) this.workerSupport = workerSupportExternal;

	var available = this.checkResourceDescriptorFiles( prepData.resources,
		[ { ext: "pcd", type: "Uint8Array", ignore: false } ]
	);

	if ( available.pcd.content !== null && available.pcd.content !== undefined ) {

		if ( prepData.useAsync ) {

			this.parseAsync( available.pcd.content, this.callbacks.onLoad );

		} else {

			this.parse( available.pcd.content );

		}

	} else {

		this.setPath( available.pcd.path );
		this.load( available.pcd.name, this.callbacks.onLoad, null, null, this.callbacks.onMeshAlter, prepData.useAsync );

	}
};


/**
 * Isolated Parser that is put to the Worker in case of async use
 * @constructor
 */
THREE.PCDLoader.Parser = function () {
	this.littleEndian = true;
	this.callbackBuilder = null;
};

THREE.PCDLoader.Parser.prototype = {

	constructor: THREE.PCDLoader.Parser,

	setLittleEndian: function ( littleEndian ) {
		this.littleEndian = littleEndian;
	},

	setCallbackBuilder: function ( callbackBuilder ) {
		if ( callbackBuilder === null || callbackBuilder === undefined ) throw 'Unable to run as no "builder" callback is set.';
		this.callbackBuilder = callbackBuilder;
	},

	parse: function ( data ) {
		var pcdHeader = this.parseHeader( data );
		this.parseData( pcdHeader, data );
	},

	parseHeader: function ( input ) {
		var data = THREE.LoaderUtils.decodeText( input );

		var result1 = data.search( /[\r\n]DATA\s(\S*)\s/i );
		var result2 = /[\r\n]DATA\s(\S*)\s/i.exec( data.substr( result1 - 1 ) );

		pcdHeader = {};
		pcdHeader.data = result2[ 1 ];
		pcdHeader.headerLen = result2[ 0 ].length + result1;
		pcdHeader.str = data.substr( 0, pcdHeader.headerLen );

		// remove comments

		pcdHeader.str = pcdHeader.str.replace( /\#.*/gi, '' );

		// parse

		pcdHeader.version = /VERSION (.*)/i.exec( pcdHeader.str );
		pcdHeader.fields = /FIELDS (.*)/i.exec( pcdHeader.str );
		pcdHeader.size = /SIZE (.*)/i.exec( pcdHeader.str );
		pcdHeader.type = /TYPE (.*)/i.exec( pcdHeader.str );
		pcdHeader.count = /COUNT (.*)/i.exec( pcdHeader.str );
		pcdHeader.width = /WIDTH (.*)/i.exec( pcdHeader.str );
		pcdHeader.height = /HEIGHT (.*)/i.exec( pcdHeader.str );
		pcdHeader.viewpoint = /VIEWPOINT (.*)/i.exec( pcdHeader.str );
		pcdHeader.points = /POINTS (.*)/i.exec( pcdHeader.str );

		// evaluate

		if ( pcdHeader.version !== null )
			pcdHeader.version = parseFloat( pcdHeader.version[ 1 ] );

		if ( pcdHeader.fields !== null )
			pcdHeader.fields = pcdHeader.fields[ 1 ].split( ' ' );

		if ( pcdHeader.type !== null )
			pcdHeader.type = pcdHeader.type[ 1 ].split( ' ' );

		if ( pcdHeader.width !== null )
			pcdHeader.width = parseInt( pcdHeader.width[ 1 ] );

		if ( pcdHeader.height !== null )
			pcdHeader.height = parseInt( pcdHeader.height[ 1 ] );

		if ( pcdHeader.viewpoint !== null )
			pcdHeader.viewpoint = pcdHeader.viewpoint[ 1 ];

		if ( pcdHeader.points !== null )
			pcdHeader.points = parseInt( pcdHeader.points[ 1 ], 10 );

		if ( pcdHeader.points === null )
			pcdHeader.points = pcdHeader.width * pcdHeader.height;

		if ( pcdHeader.size !== null ) {

			pcdHeader.size = pcdHeader.size[ 1 ].split( ' ' ).map( function ( x ) {

				return parseInt( x, 10 );

			} );

		}

		if ( pcdHeader.count !== null ) {

			pcdHeader.count = pcdHeader.count[ 1 ].split( ' ' ).map( function ( x ) {

				return parseInt( x, 10 );

			} );

		} else {

			pcdHeader.count = [];

			for ( var i = 0, l = pcdHeader.fields.length; i < l; i ++ ) {

				pcdHeader.count.push( 1 );

			}

		}

		pcdHeader.offset = {};

		var sizeSum = 0;

		for ( var i = 0, l = pcdHeader.fields.length; i < l; i ++ ) {

			if ( pcdHeader.data === 'ascii' ) {

				pcdHeader.offset[ pcdHeader.fields[ i ] ] = i;

			} else {

				pcdHeader.offset[ pcdHeader.fields[ i ] ] = sizeSum;
				sizeSum += pcdHeader.size[ i ];

			}

		}

		// for binary only
		pcdHeader.rowSize = sizeSum;

		return pcdHeader;
	},

	parseData: function ( pcdHeader, data ) {
		var position = [];
		var normal = [];
		var color = [];


		// ascii
		if ( pcdHeader.data === 'ascii' ) {

			var offset = pcdHeader.offset;
			var pcdData = textData.substr( pcdHeader.headerLen );
			var lines = pcdData.split( '\n' );

			for ( var i = 0, l = lines.length; i < l; i ++ ) {

				var line = lines[ i ].split( ' ' );

				if ( offset.x !== undefined ) {

					position.push( parseFloat( line[ offset.x ] ) );
					position.push( parseFloat( line[ offset.y ] ) );
					position.push( parseFloat( line[ offset.z ] ) );

				}

				if ( offset.rgb !== undefined ) {

					var c = new Float32Array( [ parseFloat( line[ offset.rgb ] ) ] );
					var dataview = new DataView( c.buffer, 0 );
					color.push( dataview.getUint8( 0 ) / 255.0 );
					color.push( dataview.getUint8( 1 ) / 255.0 );
					color.push( dataview.getUint8( 2 ) / 255.0 );

				}

				if ( offset.normal_x !== undefined ) {

					normal.push( parseFloat( line[ offset.normal_x ] ) );
					normal.push( parseFloat( line[ offset.normal_y ] ) );
					normal.push( parseFloat( line[ offset.normal_z ] ) );

				}

			}

		}


		// binary
		if ( pcdHeader.data === 'binary_compressed' ) {

			console.error( 'THREE.PCDLoader: binary_compressed files are not supported' );
			return;

		}

		if ( pcdHeader.data === 'binary' ) {

			var dataview = new DataView( data, pcdHeader.headerLen );
			var offset = pcdHeader.offset;

			for ( var i = 0, row = 0; i < pcdHeader.points; i ++, row += pcdHeader.rowSize ) {

				if ( offset.x !== undefined ) {

					position.push( dataview.getFloat32( row + offset.x, this.littleEndian ) );
					position.push( dataview.getFloat32( row + offset.y, this.littleEndian ) );
					position.push( dataview.getFloat32( row + offset.z, this.littleEndian ) );

				}

				if ( offset.rgb !== undefined ) {

					color.push( dataview.getUint8( row + offset.rgb + 0 ) / 255.0 );
					color.push( dataview.getUint8( row + offset.rgb + 1 ) / 255.0 );
					color.push( dataview.getUint8( row + offset.rgb + 2 ) / 255.0 );

				}

				if ( offset.normal_x !== undefined ) {

					normal.push( dataview.getFloat32( row + offset.normal_x, this.littleEndian ) );
					normal.push( dataview.getFloat32( row + offset.normal_y, this.littleEndian ) );
					normal.push( dataview.getFloat32( row + offset.normal_z, this.littleEndian ) );

				}

			}

		}

		var vertexFA = new Float32Array( position );
		var normalFA = normal.length > 0 ? new Float32Array( normal ) : null;
		var colorFA = color.length > 0 ? new Float32Array( color ) : null;

		// Global builder function will construct meshes from the supplied data
		this.callbackBuilder(
			{
				cmd: 'meshData',
				progress: {
					numericalValue: 100
				},
				params: {},
				materials: {
					multiMaterial: false,
					materialNames: [ color.length > 0 ? 'defaultVertexColorMaterial' : 'defaultPointMaterial' ],
					materialGroups: null
				},
				buffers: {
					vertices: vertexFA,
					indices: null,
					colors: colorFA,
					normals: normalFA,
					uvs: null
				},
				// 0: mesh, 1: line, 2: point
				geometryType: 2
			},
			[ vertexFA.buffer ],
			null,
			colorFA !== null ? [ colorFA.buffer ] : null,
			normalFA !== null ? [ normalFA.buffer ] : null,
			null
		);
	}

};

var debug = $( 'debug' )( 'domojs:media' );
var verbose = $( 'debug' )( 'domojs:cli' );
var id3 = require( 'musicmetadata' );
var md5 = require( 'md5' );
var levenshtein = require( 'levenshtein' );

folderMapping = false;

var processing = false;
var wasProcessing = false;
var interval = setInterval( function() {
    if( processing ) {
        debug( processing );
        wasProcessing = processing;
    }
    else if( wasProcessing ) {
        debug( 'process finished' );
        wasProcessing = false;
    }
}, 10000 );

function processFolder( folder, extension, lastIndex, callback ) {
    $( 'fs' ).readdir( translatePath( folder ), function( err, files ) {
        var result = [];
        if( err ) {
            console.log( err );
            callback( err );
        }
        else
            $.eachAsync( files, function( index, file, next ) {
                if( file == '$RECYCLE.BIN' || file == '.recycle' )
                    return next();
                file = folder + '/' + file;
                $( 'fs' ).stat( translatePath( file ), function( err, stat ) {
                    if( err ) {
                        debug( err );
                        next();
                    }
                    else if( stat.isDirectory() )
                        processFolder( file, extension, lastIndex, function( results ) {
                            result = result.concat( results );
                            next();
                        });
                    else {
                        if( extension.test( file ) && stat.mtime > lastIndex )
                            result.push( file );
                        next();
                    }
                });
            }, function() {
                callback( result );
            });
    });
}

function fileNameCleaner( fileName, extension ) {
    while( fileName.startsWith( '/' ) )
        fileName = fileName.substr( 1 );
    var encodedUriMatches = fileName.match( /%[0-9a-f]{2}/gi );
    if( encodedUriMatches && encodedUriMatches.length > 1 )
        fileName = decodeURIComponent( fileName );
    // keep only files
    fileName = fileName.replace( /^([^\/]+\/)+([^\/]+)$/g, '$2' );
    //trimming extension
    fileName = fileName.replace( extension, '' );
    //trimming endTags
    fileName = fileName.replace( /(\[[A-F0-9]+\])*$/i, '' );
    //trimming codecs and format
    fileName = fileName.replace( /(^(\[[^\]]+\]_?)(\[[^\]]{2,7}\])?)|((1080|720)[pi])|[0-9]{3,4}x[0-9]{3,4}|([XH]\.?)26[45]|xvid|ogg|mp3|ac3|\+?aac|rv(9|10)e?([_-]EHQ)?|multi|vost(f(r)?)?|real|(?:true)(?:sub)?(?:st)?fr(?:ench)?|5\.1|dvd(rip(p)?(ed)?)?|bluray|directors\.cut|web-dl|\.V?[HLS][QD]|fin(al)?|TV|B(?:R)?(?:D)(rip(p)?(ed)?)?|\.v[1-9]/gi, '' );
    //checksum
    fileName = fileName.replace( /(\[[A-F0-9]+\]|\(_CRC[A-F0-9]+\))$/i, '' );
    //other checksum format
    fileName = fileName.replace( /\[[a-f0-9]{6,8}\]/i, '' );
    //team specification at the beginning of the file name
    fileName = fileName.replace( /^([A-Z]+-)/i, '' );
    //team specification at the end of the file name
    fileName = fileName.replace( /([A-Z]+-)$/i, '' );
    //team specification in brackets
    fileName = fileName.replace( /\{[A-Z]+\}/i, '' );
    //normalizing separators to a dot
    fileName = fileName.replace( /[-\._ ]+/g, '.' );
    //trimming end tags
    fileName = fileName.replace( /\[[^\]]+\]\.?$/, '' );
    //removing empty tags
    fileName = fileName.replace( /\[[\.+-]?\]/g, '' );
    //removing empty tags with braces
    fileName = fileName.replace( /\{[\.+-]?\}/g, '' );
    //removing empty tags with parent
    fileName = fileName.replace( /\([\.+-]?\)/g, '' );
    //removing dates
    fileName = fileName.replace( /\[[0-9]{2}\.[0-9]{2}\.[0-9]{4}\]/, '' );
    fileName = fileName.replace( /[0-9]{4}/, '' );
    //trimming start for dots and spaces
    fileName = fileName.replace( /^[ \.]/g, '' );
    //trimming end for dots
    fileName = fileName.replace( /[\. ]+$/, '' );
    return fileName;
}

var tokenize = ( function() {
    var defaultDiacriticsRemovalMap = [
        { 'base': 'A', 'letters': '\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F' },
        { 'base': 'AA', 'letters': '\uA732' },
        { 'base': 'AE', 'letters': '\u00C6\u01FC\u01E2' },
        { 'base': 'AO', 'letters': '\uA734' },
        { 'base': 'AU', 'letters': '\uA736' },
        { 'base': 'AV', 'letters': '\uA738\uA73A' },
        { 'base': 'AY', 'letters': '\uA73C' },
        { 'base': 'B', 'letters': '\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181' },
        { 'base': 'C', 'letters': '\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E' },
        { 'base': 'D', 'letters': '\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779' },
        { 'base': 'DZ', 'letters': '\u01F1\u01C4' },
        { 'base': 'Dz', 'letters': '\u01F2\u01C5' },
        { 'base': 'E', 'letters': '\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E' },
        { 'base': 'F', 'letters': '\u0046\u24BB\uFF26\u1E1E\u0191\uA77B' },
        { 'base': 'G', 'letters': '\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E' },
        { 'base': 'H', 'letters': '\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D' },
        { 'base': 'I', 'letters': '\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197' },
        { 'base': 'J', 'letters': '\u004A\u24BF\uFF2A\u0134\u0248' },
        { 'base': 'K', 'letters': '\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2' },
        { 'base': 'L', 'letters': '\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780' },
        { 'base': 'LJ', 'letters': '\u01C7' },
        { 'base': 'Lj', 'letters': '\u01C8' },
        { 'base': 'M', 'letters': '\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C' },
        { 'base': 'N', 'letters': '\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4' },
        { 'base': 'NJ', 'letters': '\u01CA' },
        { 'base': 'Nj', 'letters': '\u01CB' },
        { 'base': 'O', 'letters': '\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u00D6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C' },
        { 'base': 'OI', 'letters': '\u01A2' },
        { 'base': 'OO', 'letters': '\uA74E' },
        { 'base': 'OU', 'letters': '\u0222' },
        { 'base': 'OE', 'letters': '\u008C\u0152' },
        { 'base': 'oe', 'letters': '\u009C\u0153' },
        { 'base': 'P', 'letters': '\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754' },
        { 'base': 'Q', 'letters': '\u0051\u24C6\uFF31\uA756\uA758\u024A' },
        { 'base': 'R', 'letters': '\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782' },
        { 'base': 'S', 'letters': '\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784' },
        { 'base': 'T', 'letters': '\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786' },
        { 'base': 'TZ', 'letters': '\uA728' },
        { 'base': 'U', 'letters': '\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u00DC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244' },
        { 'base': 'V', 'letters': '\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245' },
        { 'base': 'VY', 'letters': '\uA760' },
        { 'base': 'W', 'letters': '\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72' },
        { 'base': 'X', 'letters': '\u0058\u24CD\uFF38\u1E8A\u1E8C' },
        { 'base': 'Y', 'letters': '\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE' },
        { 'base': 'Z', 'letters': '\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762' },
        { 'base': 'a', 'letters': '\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250' },
        { 'base': 'aa', 'letters': '\uA733' },
        { 'base': 'ae', 'letters': '\u00E6\u01FD\u01E3' },
        { 'base': 'ao', 'letters': '\uA735' },
        { 'base': 'au', 'letters': '\uA737' },
        { 'base': 'av', 'letters': '\uA739\uA73B' },
        { 'base': 'ay', 'letters': '\uA73D' },
        { 'base': 'b', 'letters': '\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253' },
        { 'base': 'c', 'letters': '\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184' },
        { 'base': 'd', 'letters': '\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A' },
        { 'base': 'dz', 'letters': '\u01F3\u01C6' },
        { 'base': 'e', 'letters': '\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD' },
        { 'base': 'f', 'letters': '\u0066\u24D5\uFF46\u1E1F\u0192\uA77C' },
        { 'base': 'g', 'letters': '\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F' },
        { 'base': 'h', 'letters': '\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265' },
        { 'base': 'hv', 'letters': '\u0195' },
        { 'base': 'i', 'letters': '\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131' },
        { 'base': 'j', 'letters': '\u006A\u24D9\uFF4A\u0135\u01F0\u0249' },
        { 'base': 'k', 'letters': '\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3' },
        { 'base': 'l', 'letters': '\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747' },
        { 'base': 'lj', 'letters': '\u01C9' },
        { 'base': 'm', 'letters': '\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F' },
        { 'base': 'n', 'letters': '\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5' },
        { 'base': 'nj', 'letters': '\u01CC' },
        { 'base': 'o', 'letters': '\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u00F6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275' },
        { 'base': 'oi', 'letters': '\u01A3' },
        { 'base': 'ou', 'letters': '\u0223' },
        { 'base': 'oo', 'letters': '\uA74F' },
        { 'base': 'p', 'letters': '\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755' },
        { 'base': 'q', 'letters': '\u0071\u24E0\uFF51\u024B\uA757\uA759' },
        { 'base': 'r', 'letters': '\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783' },
        { 'base': 's', 'letters': '\u0073\u24E2\uFF53\u00DF\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B' },
        { 'base': 't', 'letters': '\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787' },
        { 'base': 'tz', 'letters': '\uA729' },
        { 'base': 'u', 'letters': '\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u00FC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289' },
        { 'base': 'v', 'letters': '\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C' },
        { 'base': 'vy', 'letters': '\uA761' },
        { 'base': 'w', 'letters': '\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73' },
        { 'base': 'x', 'letters': '\u0078\u24E7\uFF58\u1E8B\u1E8D' },
        { 'base': 'y', 'letters': '\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF' },
        { 'base': 'z', 'letters': '\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763' }
    ];

    var diacriticsMap = {};
    for( var i = 0;i < defaultDiacriticsRemovalMap.length;i++ ) {
        var letters = defaultDiacriticsRemovalMap[ i ].letters;
        for( var j = 0;j < letters.length;j++ ) {
            diacriticsMap[ letters[ j ] ] = defaultDiacriticsRemovalMap[ i ].base;
        }
    }

    // "what?" version ... http://jsperf.com/diacritics/12
    return function removeDiacritics( str ) {
        return str.replace( /[^\u0000-\u007E]/g, function( a ) {
            return diacriticsMap[ a ] || a;
        });
    }
})();

var coverQueue = $.queue( function( media, next ) {
    var db = $.db.another();
    tvdbScrapper( media.mediaType, media, function() {
        if( media.cover )
            $.ajax( { url: media.cover }).on( 'response', function( res ) {
                var chunks = [];
                if( res.statusCode == 301 || res.statusCode == 302 || res.statusCode == 307 )
                    return $.ajax( { url: res.headers.location }).on( 'response', arguments.callee );
                res.on( 'data', function( chunk ) {
                    chunks.push( chunk );
                });
                res.on( 'end', function( chunk ) {
                    if( chunk )
                        chunks.push( chunk );
                    var img = Buffer.concat( chunks ).toString( 'base64' );
                    if( media.tvdbid == 75001 || media.tvdbid == 81877 || media.tvdbid == 220911 ) {
                        //console.log(media.overview);
                        //console.log(img.length);
                        //console.log(media.tvdbid);
                        media.overview = '';
                    }
                    db.multi()
                        .hmset( media.id, 'cover', img, 'tvdbid', media.tvdbid || '', 'overview', media.overview || '' )
                        .hmset( media.index, 'cover', img, 'tvdbid', media.tvdbid || '', 'overview', media.overview || '' )
                        .exec( function( error, replies ) {
                            //console.log(arguments);
                            db.quit();
                            next();
                        });
                });
            });
        else
            db.multi()
                .hmset( media.id, 'tvdbid', media.tvdbid || '', 'overview', media.overview || '' )
                .hmset( media.index, 'tvdbid', media.tvdbid || '', 'overview', media.overview || '' )
                .exec( function( error, replies ) {
                    //console.log(arguments);
                    db.quit();
                    next();
                });
    }, function() {
        //console.log(media);
        db.quit();
        next();
    });
})

function videoScrapper( mediaType, media, callback, errorCallback ) {
    var episodeNumber = /(?:\.E(?:p(?:isode)?)?|Part|Chapitre)\.?([0-9]+)/i;
    var seasonNumber = /(?:\.S(?:aison)?)([0-9]+)/i;
    var name = /(([A-Z!][A-Z!0-9]*|[A-Z!0-9]*[A-Z!])+(\.|$))+/i;
    var season = seasonNumber.exec( media.name );
    var episode = episodeNumber.exec( media.name );
    var itemName = media.name.replace( extensions[ mediaType ], '' );
    if( !episode || !episode[ 1 ] ) {
        if( !season ) {
            episode = /([0-9]+)(?:x|\.)([0-9]+)/.exec( media.name );
            if( episode && episode[ 2 ] ) {
                season = episode;
                episode = { '1': episode[ 2 ], index: episode.index };
            }
            else {
                //console.log(media.name);
                episode = /(?:\.S(?:aison)?)([0-9]+)(?:E(?:p(?:isode)?)?|Part|Chapitre)\.?([0-9]+)/i.exec( media.name );
                if( episode && episode[ 2 ] ) {
                    season = episode;
                    episode = { '1': episode[ 2 ], index: episode.index };
                }
                else
                    episode = /(?:[^0-9]|^)([0-9]{1,3})(?:[^0-9]|$)/.exec( media.name );
            }
        }
        else {
            if( season && season[ 0 ] ) {
                media.name = media.name.substring( 0, season.index ) + media.name.substring( season.index + season[ 0 ].length );
                season[ 0 ] = false;
            }
            episode = /(?:[^0-9]|^)([0-9]{1,3})(?:[^0-9]|$)/.exec( media.name );
        }
    }
    if( episode && episode[ 0 ] ) {
        media.name = media.name.substring( 0, episode.index ) + media.name.substring( episode.index + episode[ 0 ].length );
    }
    if( season && season[ 0 ] ) {
        media.name = media.name.substring( 0, season.index ) + media.name.substring( season.index + season[ 0 ].length );
    }
    var maxLength = Math.min( season && season.index || media.name.length, episode && episode.index || media.name.length );
    if( episode !== null && episode && episode[ 1 ] )
        episode = episode[ 1 ];
    itemName = name.exec( media.name );

    if( itemName ) {
        if( itemName.index + itemName[ 0 ].length > maxLength )
            itemName = itemName[ 0 ].substr( 0, maxLength );
        else
            itemName = itemName[ 0 ];
    }
    else
        itemName = media.name;
    itemName = itemName.replace( /prologue|oav|ova/gi, '' ).replace( /\./g, ' ' ).replace( / $/, '' );
    var args = { mediaType: mediaType, path: media.path, name: itemName, displayName: itemName };
    var finishProcessing = function() {
        var itemId = ( 'media:' + mediaType + ':' + args.name.replace( / /g, '_' ) + ( season && ':' + pad( season[ 1 ], 2 ) || '' ) + ( episode && ':' + pad( episode, 3 ) || '' ) ).toLowerCase();
        //console.log(args.name);
        media.name = args.name.toLowerCase();
        media.id = itemId;
        if( season ) {
            args.season = Number( season[ 1 ] );
            args.displayName = args.displayName + ' - S' + Number( season[ 1 ] );
        }
        if( episode ) {
            args.episode = media.episode = Number( episode );
            args.displayName = args.displayName + ' - E' + Number( episode );
        }
        media.index = args.index = 'index:video:' + args.name.toLowerCase();
        if( args.episode == 1 || !args.episode )
            coverQueue.enqueue( media );

        //console.log('finishing '+args.displayName);
        callback( { args: args, id: itemId, tokens: args.displayName.split( ' ' ).concat( media.path.split( /[ \/]/g ) ) });
    };
    tvdbScrapper( mediaType, args, finishProcessing, finishProcessing );
}

function pad( n, width, z ) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array( width - n.length + 1 ).join( z ) + n;
}

function translatePath( path ) {
    if( path.startsWith( '//' ) && process.platform != 'win32' ) {
        path = path.substring( 2 ).replace( /\//g, $( 'path' ).sep );
        var indexOfSlash = path.indexOf( $( 'path' ).sep );
        path = path.substring( 0, indexOfSlash ) + ':' + path.substring( indexOfSlash );
        if( !folderMapping ) {
            folderMapping = {};
            var fstab = $( 'fs' ).readFileSync( '/etc/fstab', 'ascii' );
            var declarations = fstab.split( /\n/g );
            $.each( declarations, function( index, line ) {
                var declaration = line.split( /[ \t]/g );
                if( typeof ( line ) != 'undefined' && declaration.length > 1 ) {
                    folderMapping[ declaration[ 0 ] ] = declaration[ 1 ]
                }
            });
            debug( folderMapping );
        }
        $.each( folderMapping, function( remotePath, localPath ) {
            if( path.startsWith( remotePath ) )
                path = path.replace( remotePath, localPath );
        });
    }
    return path;
}

function musicScrapper( mediaType, media, callback, errorCallback ) {
    try {
        var path = translatePath( media.path );
        var file = $( 'fs' ).createReadStream( path );
        id3( file, function( error, tags ) {
            if( error ) {
                debug( error );
                if( errorCallback )
                    errorCallback( error );
                return;
            }
            media.mediaType = mediaType;
            media.name = tags.title;
            media.artist = tags.artist && tags.artist[ 0 ] || 'Artiste inconnu';
            media.album = tags.album;
            media.year = tags.year;
            media.trackNo = tags.track.no;
            media.albumTracks = tags.track.of;
            media.diskNo = tags.disk.no;
            media.disks = tags.disk.of;
            media.size = $( 'fs' ).statSync( path ).size;
            media.length = tags.duration;
            media.index = 'index:music:' + media.artist + ':' + media.album;
            if( tags.artist && tags.artist[ 0 ] )
                media.displayName = media.name + ' - ' + media.artist;
            else
                media.displayName = media.name;
            media.cover = tags.picture && tags.picture[ 0 ] && tags.picture[ 0 ].data.toString( 'base64' );
            var indexes = [];
            for( var artist in tags.artist )
                indexes.push( 'media:music:artist:' + artist );
            for( var artist in tags.albumartist )
                indexes.push( 'media:music:artist:' + artist );
            indexes.push( 'media:music:album:' + tags.album );
            indexes.push( 'media:music:name:' + tags.title );
            file.destroy();
            callback( {
                id: 'media:' + mediaType + ':' + media.artist + ':' + media.album + ':' + pad( media.trackNo, 3 ),
                tokens: tags.title.split( ' ' ).concat( tags.album.split( ' ' ) ).concat( tags.artist.join( ' ' ).split( ' ' ) ).concat( tags.albumartist.join( ' ' ).split( ' ' ) ),
                args: media,
                indexes: indexes
            });
        }).on( 'done', function( err ) {
            if( err ) {
                errorCallback( err );
                file.destroy();
            }
        });
    }
    catch( err ) {
        console.log( err );
        var db = $.db.another();
        db.sadd( 'media:' + mediaType + ':failedToIndex', media.path, function() {
            console.log( 'added ' + media.path + ' to failed to index list' );
            callback();
            db.quit();
        });
    }
}

function errorCallback( err ) {
    console.log( err );
    var db = $.db.another();
    db.sadd( 'media:' + mediaType + ':failedToIndex', path, function() {
        console.log( 'added ' + path + ' to failed to index list' );
        callback();
        db.quit();
    });
}

function indexer( db, mediaType, scrapper, callback ) {
    db.spop( 'media:' + mediaType + ':toIndex', function( err, path ) {
        verbose( 'processing', path )
        if( err )
            console.log( err );
        if( !path ) {
            db.quit();
            return processing = false;
        }
        var item = { name: fileNameCleaner( path, extensions[ mediaType ] ), path: path };
        scrapper( mediaType, item, function( result ) {
            if( result ) {
                var args = [ result.id ];
                result.args.path = 'file:///' + result.args.path;
                result.args.added = new Date().toISOString();
                $.each( Object.keys( result.args ), function( index, key ) {
                    args.push( key );
                    args.push( result.args[ key ] );
                });
                var multi = db.multi()
                    .hmset( args )
                    .hmset( result.args.index, 'name', result.args.name )
                    .set( result.args.path, result.id )
                    .sadd( 'media:' + mediaType, result.id )
                    .sadd( 'index:' + mediaType, result.args.index );

                if( result.args.episode ) {
                    multi.
                        sadd( result.args.index + ':episodes', result.id ).
                        hmset( result.args.index, 'season', result.args.season || 1 );
                    if( result.args.cover )
                        multi.hset( result.args.index, 'cover', result.args.cover );
                }
                if( result.args.trackNo )
                    multi.sadd( result.args.index + ':tracks', result.id, 'album', result.args.album, 'artist', result.args.artist );
                if( result.indexes )
                    for( var index in result.indexes )
                        multi.sadd( result.indexes[ index ], result.id );
                $.each( result.tokens, function( index, token ) {
                    if( token != '-' )
                        multi.sadd( 'tokens:' + mediaType + ':' + tokenize(token.replace( / /g, '_' ).toLowerCase()), result.id, result.args.index );
                });
                multi.exec( function( err, replies ) {
                    if( err )
                        console.log( err );
                    process.nextTick( function() {
                        indexer( db, mediaType, scrapper, callback, errorCallback );
                    });
                });
                verbose( result.id );
            }
            else
                process.nextTick( function() {
                    indexer( db, mediaType, scrapper, callback, errorCallback );
                });

        });
    });

    db.set( 'media:' + mediaType + ':lastIndex', new Date().toISOString(), function( err ) {
        if( err )
            console.log( err );
    });
    callback( 200 );
}

var extensions = { video: /\.(avi|mkv|flv|mp4|mpg|ts)$/i, music: /\.(mp3|fla|flac|m4a)$/i };
var scrappers = { video: videoScrapper, music: musicScrapper };

var tvdbMirrors = false;
var tvdbCache = {};
function tvdbScrapper( mediaType, media, callback, errorCallback ) {
    if( !tvdbMirrors ) {
        $.ajax( {
            type: 'get',
            url: 'http://thetvdb.com/api/833A54EE450AAD6F/mirrors.xml',
            dataType: 'xml',
            success: function( data ) {
                tvdbMirrors = data.Mirrors.Mirror;
                tvdbScrapper( mediaType, media, callback, errorCallback );
            },
            error: function( err ) {
                console.log( err );
            }
        });
        return;
    }
    var mirror = tvdbMirrors[ Math.floor( Math.random() * tvdbMirrors.length ) ].mirrorpath[ 0 ];
    var buildPath = function( Series, confidence ) {
        if( Series.Overview )
            media.overview = Series.Overview[ 0 ];
        media.tvdbid = Series.seriesid[ 0 ];
        if( confidence > 0.8 )
            media.name = Series.SeriesName[ 0 ];
        var newName = media.displayName;
        newName += $( 'path' ).extname( media.path );
        var handleSerie = function( Series ) {
            //console.log(media.path);
            if( Series.poster && Series.poster[ 0 ] && ( media.episode == 1 || !media.episode ) )
                media.cover = mirror + '/banners/' + Series.poster[ 0 ];
            if( Series.Genre[ 0 ].indexOf( '|Animation|' ) > -1 )
                if( confidence > 0.5 ) {
                    callback( 'Animes/' + Series.SeriesName[ 0 ] + '/' + newName );
                }
                else {
                    callback( 'Animes/' + ( media.originalName || media.name ) + '/' + newName );
                }
            else {
                callback( 'TV Series/' + Series.SeriesName[ 0 ] + '/' + newName );
            }
        };
        if( tvdbCache[ media.tvdbid ] )
            handleSerie( tvdbCache[ media.tvdbid ] );
        else
            $.ajax( {
                url: mirror + '/api/833A54EE450AAD6F/series/' + media.tvdbid + '/fr.xml',
                dataType: 'xml',
                success: function( data ) {
                    data = data.Data.Series;
                    Series = data[ 0 ];
                    tvdbCache[ media.tvdbid ] = Series;
                    handleSerie( Series );
                    //console.log(confidence);
                    //console.log(Series.Genre);
                },
                error: function( err ) {
                    console.log( err );
                    errorCallback( err );
                }
            });
    };
    var confidence = function( name, names ) {
        var max = 0;
        name = name.toLowerCase().replace( /[^A-Z0-9 ]/gi, '' );
        if( names )
            $.each( names, function( i, n ) {
                var tokens = n.replace( / \([0-9]{4}\)$/, '' ).replace( /[^A-Z0-9 ]/gi, '' ).toLowerCase();
                var lev = new levenshtein( name, tokens ).distance;
                var c = 1 - lev / tokens.length;
                if( lev < 3 && c >= max ) {
                    max = c;
                }
                tokens = tokens.split( ' ' );
                var match = $.grep( tokens, function( token ) {
                    var indexOfToken = name.indexOf( token );
                    return token.length > 0 && indexOfToken > -1 && ( indexOfToken + token.length == name.length || /^[^A-Z]/i.test( name.substring( indexOfToken + token.length ) ) );
                });
                c = match.length / name.split( ' ' ).length * match.length / tokens.length;
                if( c >= max )
                    max = c;
            });
        return max;;
    };
    function handleResults( data ) {
        if( !tvdbCache[ media.name ] )
            tvdbCache[ media.name ] = data;
        data = data.Data;
        var i = 0;
        /*if(media.name.toLowerCase()=='forever')
        {
            console.log(data.Series);
        }*/
        if( data && data.Series && data.Series.length == 1 ) {
            buildPath( data.Series[ 0 ], confidence( media.name, data.Series[ 0 ].SeriesName ) );
            return;
        }
        else if( data && !data.Series ) {
            var splittedName = media.name.split( ' ' );
            if( splittedName.length > 1 ) {
                tvdbScrapper( mediaType, $.extend( {}, media, { name: splittedName[ 0 ], originalName: media.name }), callback, function() {
                    tvdbScrapper( mediaType, $.extend( {}, media, { name: splittedName[ 1 ], originalName: media.name }), callback, errorCallback );
                });
            }
            else
                errorCallback();
            return;
        }
        else {
            var name = media.originalName || media.name;
            var max = 0;
            var matchingSeries = false;
            if( data ) {
                $.each( data.Series, function( index, serie ) {
                    var c = confidence( name, serie.SeriesName );
                    if( c >= max ) {
                        if( c != max || matchingSeries.language != serie.language && serie.language == 'fr' ) {
                            /*if(matchingSeries)
                                console.log('replacing '+matchingSeries.SeriesName+'('+max+') by '+serie.SeriesName+'('+c+')');*/
                            max = c;
                            matchingSeries = serie;
                        }
                    }
                });
                if( !matchingSeries ) {
                    console.log( 'trying aliases for ' + name );
                    $.each( data.Series, function( index, serie ) {
                        if( !serie.AliasNames )
                            return;
                        var c = confidence( name, serie.AliasNames[ 0 ].split( '|' ) );
                        if( c > max ) {
                            max = c;
                            matchingSeries = serie;
                        }
                    });
                }
            }
            if( matchingSeries )
                buildPath( matchingSeries, max );
            else {
                console.log( 'could no find a matching serie for ' + name );
                if( data )
                    console.log( data.Series );
                errorCallback();
            }
            return;
        }
    }
    if( tvdbCache[ media.name ] )
        handleResults( tvdbCache[ media.name ] );
    else
        $.ajax( {
            type: 'GET',
            url: mirror + '/api/GetSeries.php',
            dataType: 'xml',
            data: { seriesname: media.name, language: 'fr', user: '721BD243D324D1BD' },
            success: handleResults,
            error: errorCallback
        });
}

function guessPath( media, callback ) {
    var newPath = '';
    switch( media.mediaType ) {
        case 'music':
            if( media.isCompilation )
                newPath += 'Compilations/';
            else
                newPath += media.artist + '/';
            newPath += media.album + '/';
            if( media.discNo )
                newPath += media.discNo + '.';
            newPath += media.trackNo + ' - ' + media.name;
            newPath += $( 'path' ).extname( media.path );
            callback( newPath );
            break;
        case 'video':
            if( media.episode == media.season && typeof ( media.episode ) == 'undefined' )
                callback( 'Movies/' + media.displayName + $( 'path' ).extname( media.path ) );
            else
                tvdbScrapper( media.mediaType, media, callback, function() {
                    console.log( 'unable to build path for media' );
                    console.log( media );
                    callback( false );
                });
            break;
    }
}

function mkdirp( path, callback ) {
    $( 'fs' ).exists( path, function( exists ) {
        if( !exists )
            mkdirp( $( 'path' ).dirname( path ), function( err ) {
                if( err )
                    callback( err );
                else
                    $( 'fs' ).mkdir( path, callback )
            });
        else
            callback();
    })
}

function getNonExisingPath( path, callback ) {
    var trial = function( i ) {
        console.log( i );
        var trialPath = path;
        if( i > 0 ) {
            var p = $( 'path' );
            trialPath = p.join( p.dirname( path ), p.basename( path, p.extname( path ) ) + ' ' + i + p.extname( path ) );
        }
        $( 'fs' ).exists( trialPath, function( exists ) {
            console.log( trialPath );
            if( !exists ) {
                callback( trialPath );
                return;
            }
            else {
                trial( i + 1 );
            }
        });
    }
    trial( 0 )
}

function move( newTarget, media, next ) {
    guessPath( media, function( path ) {
        if( path ) {
            path = $( 'path' ).join( newTarget, path );
            $( 'fs' ).stat( translatePath( media.path ), function( err, stats ) {
                var src = $( 'fs' ).createReadStream( translatePath( media.path ) );

                mkdirp( $( 'path' ).dirname( path ), function( err ) {
                    if( err ) {
                        next( err );
                        return;
                    }
                    debug( 'path created if necessary' );
                    getNonExisingPath( path, function( path ) {
                        debug( 'copying ' + media.path + ' to ' + path );
                        var size = 0;
                        var lastPercent = 0;
                        var target = $( 'fs' ).createWriteStream( path );

                        src.pipe( target );
                        var error = null;
                        src.on( 'data', function( buf ) {
                            size += buf.length;
                            var newPercent = size / stats.size * 100;
                            if( Math.floor( newPercent ) > lastPercent ) {
                                $.emit( 'media.import.status', { name: media.displayName, progress: size / stats.size, downloadedSize: size, total: stats.size });
                                lastPercent = newPercent;
                                //console.log(size/stats.size*100+'%')
                            }
                        });
                        src.on( 'end', function() {
                            if( error != null ) {
                                debug( 'an error has occurred while copying : ' + error.code );
                                return;
                            }
                            var oldPath = media.path;
                            media.path = path;
                            debug( 'copied ' + oldPath + ' to ' + path );

                            $( 'fs' ).unlink( translatePath( oldPath ), function( err ) {
                                if( err )
                                    debug( err );
                                $( 'fs' ).readdir( translatePath( $( 'path' ).dirname( oldPath ) ), function( error, files ) {
                                    debug( files );
                                    if( error ) {
                                        next( error );
                                    }
                                    else if( files.length == 1 && files[ 0 ].endsWith( '.nfo' ) ) {
                                        $( 'fs' ).unlink( translatePath( $( 'path' ).dirname( oldPath ) + $( 'path' ).sep + files[ 0 ] ), function( err ) {
                                            if( err ) {
                                                next( err );
                                            }
                                            else {
                                                $( 'fs' ).rmdir( translatePath( $( 'path' ).dirname( oldPath ) ), function( error ) {
                                                    next( error );
                                                })
                                            }
                                        })
                                    }
                                    else if( files.length == 0 )
                                        $( 'fs' ).rmdir( translatePath( $( 'path' ).dirname( oldPath ) ), function( error ) {
                                            next( error );
                                        })
                                    else {
                                        next();
                                    }
                                })
                            });
                        });
                        target.on( 'error', function( err ) {
                            error = err;
                            debug( 'could not copy ' + media.path + ' to ' + path );
                            debug( err );
                        });
                    });
                })
                debug( 'copying ' + media.path + ' to ' + path );
            });
        }
        else
            next();
    });
}

function processSource( source, type, name, season, episode, album, artist, callback ) {
    var indexers = 10;
    var sources = $.settings( source ) || [];
    var result = [];
    if( processing )
        callback( 404 );
    processing = 'processing folders';
    var extension = extensions[ type ];
    var lastIndex = new Date( 0 );
    var matcher = function( item ) {
        return ( !name || item.name == name ) &&
            ( !season || item.season == season ) &&
            ( !episode || item.episode == episode ) &&
            ( !album || item.album == album ) &&
            ( !artist || item.artist == artist );
    }
    var self = this;
    $.eachAsync( sources, function( index, source, next ) {
        processFolder( source, extension, lastIndex, function( media ) {
            result = result.concat( media );
            next();
        });
    }, function() {
        debug( 'found ' + result.length + ' new ' + type + '(s)' );
        processing = 'processing indexation';
        var trueResult = {};
        $.eachAsync( result, function( index, path, next ) {
            scrappers[ type ]( type, { name: fileNameCleaner( path, extensions[ type ] ), path: path }, function( item ) {
                if( item && matcher( item.args ) ) {
                    var group = trueResult[ item.args.album || item.args.name ];
                    if( !group )
                        trueResult[ item.args.album || item.args.name ] = group = [];
                    group.push( item.args );
                }
                next();
            }, function( error ) {
                debug( error );
                next();
            });
        }, function() {
            processing = false;
            callback( trueResult );
        });
    });
}

module.exports = {
    dropbox: function( id, name, season, episode, album, artist, callback ) {
        processSource( 'source:dropbox', id, name, season, episode, album, artist, callback );
    },
    reorganize: function( db, id, name, album, artist, callback ) {
        var self = this;
        var newTarget = $.settings( 'source:' + id ) || [];
        if( newTarget.length === 0 )
            return callback( 500, 'No source for ' + id );
        newTarget = translatePath( newTarget[ 0 ] );
        if( processing )
            return callback( 404 );
        processSource( 'source:' + id, id, name, null, null, album, artist, function( result ) {
            var paths = [];
            processing = 'importing';
            callback( result );
            $.eachAsync( result, function( i, subResult, next1 ) {
                console.log( arguments );
                $.eachAsync( subResult, function( i, media, next ) {
                    $.emit( 'message', 'importing ' + media.displayName );
                    move( newTarget, media, next );
                }, function() {
                    next1();
                });
            },
                function() {
                    if( paths.length === 0 ) {
                        processing = false;
                        return;
                    }
                    paths.unshift( 'media:' + id + ':toIndex' );
                    db.sadd( paths, function( err, result ) {
                        processing = false;
                        if( err )
                            console.log( err );
                    });
                })
        });
    },
    import: function( db, id, name, season, episode, album, artist, callback ) {
        var self = this;
        var newTarget = $.settings( 'source:' + id ) || [];
        if( newTarget.length === 0 )
            return callback( 500, 'No source for ' + id );
        newTarget = translatePath( newTarget[ 0 ] );
        if( processing )
            return callback( 404 );
        self.dropbox( id, name, season, episode, album, artist, function( result ) {
            var paths = [];
            processing = 'importing';
            if( !$.console )
                callback( result );
            $.eachAsync( result, function( i, subResult, next1 ) {
                $.eachAsync( subResult, function( i, media, next ) {
                    console.log( arguments );
                    $.emit( 'message', 'importing ' + media.displayName );
                    move( newTarget, media, function( err ) {
                        if( err )
                            debug( err );
                        else
                            paths.push( media.path );
                        next();
                    });
                }, function() {
                    next1();
                });
            },
                function() {
                    if( paths.length === 0 ) {
                        processing = false;
                        return;
                    }
                    paths.unshift( 'media:' + id + ':toIndex' );
                    db.sadd( paths, function( err, result ) {
                        processing = false;
                        if( err )
                            console.log( err );
                        if( $.console )
                            callback( path );
                    });
                })
        });
    },
    get: function( db, id, callback ) {
        var indexers = 10;
        var sources = $.settings( 'source:' + id ) || [];
        var result = [];
        processing = 'processing folders';
        var extension = extensions[ id ];
        db = db.another();
        db.select( 0, function() {
            db.scard( 'media:' + id + ':toIndex', function( err, count ) {
                if( count == 0 )
                    db.get( 'media:' + id + ':lastIndex', function( err, lastIndex ) {
                        if( err )
                            console.log( err );
                        lastIndex = new Date( lastIndex );
                        if( !$.cli )
                            callback( 200 );
                        $.eachAsync( sources, function( index, source, next ) {
                            processFolder( source, extension, lastIndex, function( media ) {
                                result = result.concat( media );
                                debug( result );
                                next();
                            });
                        }, function() {
                            debug( result );
                            debug( 'found ' + result.length + ' new ' + id + '(s)' );
                            processing = 'processing indexation';
                            result.unshift( 'media:' + id + ':toIndex' );
                            db.sadd( result, function( err ) {
                                if( err )
                                    console.log( err );
                                for( var i = 0;i < indexers;i++ ) {
                                    indexer( db.another(), id, scrappers[ id ], $.noop );
                                }
                                db.quit();
                            });
                        });
                    });
                else {
                    processing = 'processing indexation';
                    for( var i = 0;i < Math.max( indexers, count );i++ ) {
                        indexer( db.another(), id, scrappers[ id ], $.noop );
                    }
                }
            });
        })
    },
    check: function( db, id, callback ) {
        var indexers = 10;
        var sources = $.settings( 'source:' + id ) || [];
        var result = [];
        processing = 'processing folders';
        var extension = extensions[ id ];
        db.scard( 'media:' + id + ':toIndex', function( err, count ) {
            if( count == 0 ) {
                lastIndex = new Date( 1, 0, 1 );
                callback( 200 );
                db.sort( 'media:' + id, 'BY', 'nosort', 'GET', '*->path', function( err, paths ) {
                    var result = [];
                    $.eachAsync( paths, function( index, path, next ) {
                        $( 'fs' ).exists( translatePath( path.substring( 'file:///'.length ) ), function( exists ) {
                            if( !exists )
                                result.push( path );
                        });
                    }, function() {
                        debug( 'found ' + result.length + ' incorrect ' + id + ' path(s)' );

                        if( result.length === 0 ) {
                            indexer( db, id, scrappers[ id ], $.noop );
                            return processing = false;
                        }
                        processing = 'processing indexation';
                        result.unshift( 'media:' + id + ':toIndex' );
                        db.sadd( result, function( err ) {
                            if( err )
                                console.log( err );
                            for( var i = 0;i < indexers;i++ ) {
                                indexer( db, id, scrappers[ id ], $.noop );
                            }
                        });
                    });
                });
            }
            else {
                processing = 'processing indexation';
                for( var i = 0;i < indexers;i++ ) {
                    indexer( db, id, scrappers[ id ], $.noop );
                }
            }
        });
    },
    reset: function( db, id, callback ) {
        db.keys( 'media:' + id + ':*', function( err, keys ) {
            db.keys( 'tokens:' + id + ':*', function( err, tokens ) {
                db.keys( 'index:' + id + '*', function( err, indexes ) {
                    keys = keys.concat( tokens ).concat( indexes );
                    console.log( 'removing ' + keys.length + ' keys' );
                    db.del( keys, function( err ) {
                        console.log( err );
                        callback( err || 'ok' );
                    });
                });
            })
        });
    }
};
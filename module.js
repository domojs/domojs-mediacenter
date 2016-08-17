$.getScript( 'assets/media/js/player.js', function() {
    var miniPlayer = $( '<a style="padding-top:0; padding-bottom:0;height:50px" class="mini-player dropdown-toggle" data-toggle="dropdown">\
                <div class="col-xs-4">\
                    <img class="art" style="height:50px"/>\
                </div>\
                <div class="col-xs-8 row">\
                    <div style="height:5px;" class="progress">\
                        <div class="progress-bar text-art-tertiary" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" style="width: 0;">\
                        </div>\
                        <div class="time-left text-art-tertiary"></div>\
                    </div>\
                    <div class="text" style="color:white; overflow:hidden; width:150px; line-height:1em;height:1em;text-overflow:ellipsis;"></div>\
                    <div class="player-switch btn-group push-right hidden-xs">\
                        <button type="button" class="btn btn-xs btn-default art dropdown-toggle" data-toggle="dropdown">\
                            <span class="caret"></span>\
                        </button>\
                        <ul class="dropdown-menu" role="menu">\
                        </ul>\
                    </div>\
                </div>\
            </a>');
    var extendedPlayer = $( '<ul class="dropdown-menu" role="menu"></ul>' );
    miniPlayer = miniPlayer.add( extendedPlayer );
    var $commands = $( '<li></li>' );
    extendedPlayer.append( $commands );
    $commands.append( $( '<a class="pause"><span class="fa fa-chevron-left"></span></a>' ).click( function() {
        commands.prev();
    }) );
    $commands.append( $( '<a class="pause"><span class="fa fa-pause"></span></a>' ).click( function() {
        commands.pause();
    }) );
    $commands.append( $( '<a class="pause"><span class="fa fa-chevron-right"></span></a>' ).click( function() {
        commands.next();
    }) );
    $( 'a', $commands ).css( 'display', 'inline' )
    activeItem = '';
    socket.on( 'player.status', function( status ) {
        switch( status.state ) {
            case 'playing':
                $( '.pause, .stop', $commands ).show();
                $( '.play', $commands ).hide();
                break;
            case 'paused':
                $( '.pause, .stop', $commands ).show();
                $( '.play', $commands ).hide();
                break;
            case 'stopped':
                $( 'ul.playlist' ).empty();
                activeItem = '.' + playItem.id.replace( /[^\w]/g, '_' )
                $( '.text', miniPlayer ).text( '' );
            default:
                $( '.pause, .stop', $commands ).hide();
                $( '.play', $commands ).show();
                break;
        }
        var progressBars = $( '.progress-bar', miniPlayer );
        if( activeItem ) {
            $( activeItem ).addClass( 'read read-1' );
            progressBars = progressBars.add( activeItem + ' .progress-bar' );
        }
        progressBars.css( 'width', status.position * 100 + '%', 1000 );
    });

    socket.on( 'player.playlist', function( playlist ) {
        $( 'ul.playlist' ).empty();
        $.each( playlist, function( index, playItem ) {

            var item = $( '<li>' ).text( playItem.displayName );

            item.on( 'click', function() {
                commands.play( item.index() );
            });
            if( playItem.active ) {
                activeItem = '.' + playItem.id.replace( /[^\w]/g, '_' )
                item.addClass( 'active' );
                $( '.text', miniPlayer ).text( playItem.displayName );
            }
            else
                item.addClass( 'hidden-xs' );
            $( 'ul.playlist' ).append( item );

        });
    });

    socket.on( 'player.art', function( img ) {
        if( typeof ( img ) !== 'string' ) {
            var blob = new Blob( [ img ], { type: 'image/jpeg' }); // pass a useful mime type here
            img = URL.createObjectURL( blob );
        }
        $( 'img.art' ).prop( 'src', img );
    });
    var mdule = $( '<li class="dropdown mediacenter module" ></li>' );
    mdule.prepend( miniPlayer );
    $( '#modulePlaceHolder' ).prepend( mdule );
});

( function() {
    var $module = $( '<li class="import module dropdown"><a href class="dropdown-toggle hidden-xs" style="padding-top:15px; padding-bottom:0;height:54px;display:block" data-toggle="dropdown" role="button" aria-expanded="false">\
                    <div style="height:5px;width:200px;margin-bottom:5px;" class="progress">\
                        <div class="progress-bar text-art-tertiary" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" style="width: 0;">\
                        </div>\
                    </div>\
                    <span class="progress-text" style="display:inline-block; width:185px; text-align:center"></span><span class="caret"></span></a>\
                    <ul class="dropdown-menu" role="menu">\
                        <li class="downloaded-size"></li>\
                        <li class="name"></li>\
                    </ul>\
                    </li>');
    $module.hide();
    var timeout = false;
    function humanReadable( size ) {
        var n = 0;
        while( size > 1500 ) {
            size /= 1024;
            n++;
        }
        size = Math.round( size, 2 );
        switch( n ) {
            case 0:
                size += ' o';
                break;
            case 1:
                size += ' ko';
                break;
            case 2:
                size += ' Mo';
                break;
            case 3:
                size += ' Go';
                break;
        }
        return size;
    }

    socket.on( 'media.import.status', function( status ) {
        if( status.progress ) {
            if( timeout )
                clearTimeout( timeout );

            $( '.downloaded-size', $module ).text( humanReadable( status.downloadedSize ) + ' / ' + humanReadable( status.total ) );
            $( '.name', $module ).text( status.name );
            var progressPercent = Math.round( status.progress * 10000 ) / 100;
            $( '.progress-text', $module ).text( progressPercent + ' %' );
            $( '.progress-bar', $module ).width( progressPercent - 5 + '%' );
            $module.show();
            timeout = setTimeout( function() {
                $module.hide();
            }, 120000 );
        }
        if( status.progress == 100 ) {
            $.gritter.add( 'Download completed' );
            $module.hide();
        }
    });
    $( '#modulePlaceHolder' ).prepend( $module );
})();


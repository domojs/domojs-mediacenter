route.on( 'media/*', function( url, params, unchanged ) {
    var categories = {
        animes: 'Animes',
        movies: 'Films',
        music: 'Musique',
        photo: 'Photos',
        series: 'Séries TV'
    };
    var template = '/media/'
    if( $.grep( categories, function( e, i ) {
        return i == params.wildcard;
    }).length > 0 )
        template += 'series';
    else
        template += params.wildcard;
    $.ajax( loadHtml( '/media/series', function() {
        page.preFilter = params.wildcard;
        $.each( categories, function( i, e ) {

            $( '<li></li>' ).toggleClass( 'active', i == params.wildcard ).append( $( '<a href="#media/' + i + '">' + e + '</a>' ) ).appendTo( 'ul#leftPane' );
        });
        $( '<li class="player-switch dropdown">\
            <a class="dropdown-toggle" data-toggle="dropdown">\
                <span class="btn-label"></span> <span class="caret"></span>\
            </a>\
            <ul class="dropdown-menu" role="menu">\
            </ul>\
        </li>').appendTo( 'ul#leftPane' );



        Queue = function( processor, queue ) {
            if( this == window )
                return new Queue( processor, queue );
            var processing = false;
            var filePath = queue;
            filePath = null;
            queue = this.pending = queue || [];
            console.log( queue );
            var self = this;
            this.enqueue = function( message ) {
                console.log( message );
                queue.push( message );
                self.save();
                processQueue();
            };

            this.save = function() {
                if( filePath )
                    $( 'fs' ).writeFile( filePath, JSON.stringify( queue ), function( err ) {
                        if( err )
                            console.log( err );
                    });

            }

            var processQueue = this.process = function() {
                if( processing )
                    return;
                processing = true;
                var message = queue.shift();
                self.current = message;
                if( !message )
                    return processing = false;
                processor( message, function( processed ) {
                    if( processed === false ) {
                        self.enqueue( message );
                    }
                    self.save();
                    processing = false;
                    if( processed !== false )
                        if( process && process.nextTick )
                            process.nextTick( processQueue );
                        else
                            setTimeout( processQueue, 0 );

                });
            };

            if( queue.length > 0 )
                processQueue();
        };


        $.ajax( {
            url: '/api/media/library/video', type: 'get', dataType: 'json', data: { viewName: 'thumbnails', 'search[value]': page.preFilter, start: 0, length: 100 }, success: function( data ) {

                var coverQueue = new Queue( function( message, next ) {
                    $.ajax( {
                        url: '/api/media/library/getArt/' + message.id, success: function( cover ) {
                            message.img.attr( 'src', 'data:image;base64,' + cover );
                        }, complete: next
                    })
                })
                data = data.data;
                for( var i in data ) {
                    /*if(i%12==0)
                    {
                        var row=$('<div class="container-fluid row"></div>');
                        row.appendTo('#thumbnails');
                    }*/
                    var template = $( '<div class="col-sm-4 col-md-2 thumbnail"><img /><div class="caption"><h3></h3></div></div>' );
                    template.find( '.caption h3' ).text( data[ i ].name );
                    if( data[ i ].cover ) {
                        template.find( 'img' ).attr( 'src', 'data:image;base64,' + data[ i ].cover );
                    }
                    else
                        coverQueue.enqueue( { id: data[ i ].id, img: template.find( 'img' ) });
                    template.appendTo( '#thumbnails' );
                    template.hover( function() {
                        $( this ).find( '.caption' ).fadeIn( 500 );
                    }, function() {
                        $( this ).find( '.caption' ).fadeOut( 500 );
                    })
                }
            }
        });

        $( '#mainPane .table' ).dataTable( {
            ajax: function( data, callback, settings ) {
                $.ajax( {
                    url: '/api/media/library/video', type: 'get', dataType: 'json', data: { 'search[value]': page.preFilter + ( data.search.value && ' ' + data.search.value || '' ), length: isNaN( data.length ) && 100 || data.length, start: data.start }, success: function( data ) {
                        callback( data );
                    }
                });
            }, serverSide: true, processing: false, searching: true, lengthChange: false, scrollY: '650px', dom: 'frtiS', columns: [
                { title: "Nom", data: "name" },
                {
                    title: "Episode", data: "episode", createdCell: function( cell, cellData, rowData ) {
                        if( rowData.readcount )
                            $( cell ).addClass( 'read read-' + rowData.readcount );
                        $(cell).addClass(rowData.id.replace(/[^\w]/g, '_'));
                            $(cell).append('<div style="height:5px;" class="progress">\
    <div class="progress-bar progress-bar-success" role="progressbar" aria-valuenow="70"\
    aria-valuemin="0" aria-valuemax="100" style="width:'+rowData.position+'%">\
        <span class="sr-only"></span>\
    </div>\
    </div>');
                    }
                },
                { title: "Saison", data: "season" },
                {
                    title: "Commandes", data: "id", createdCell: function( cell, cellData, rowData, rowIndex, colIndex ) {
                        $( cell ).empty()
                            .append( $( '<a class="pull-left btn" title="Lire"><span class="fa fa-play"></span></a>' ).click( function() {
                                commands.play( cellData );
                            }) )
                            .append( ' ' )
                            .append( $( '<a class="pull-left btn" title="Ajouter à la liste de lecture"><span class="fa fa-plus"></span></a>' ).click( function() {
                                commands.enqueue( cellData );
                            }) )
                            ;
                    }
                }]
        });
    }) );
});

route.on( 'media', function( url, params, unchanged ) {
    $.ajax( loadHtml( '/media' ) );
});
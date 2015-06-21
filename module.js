        $.getScript('assets/media/js/player.js', function(){
            var miniPlayer=$('<a style="padding-top:0; padding-bottom:0; height:54px" class="mini-player dropdown-toggle" data-toggle="dropdown">\
                <div class="col-xs-4">\
                    <img class="art" style="height:54px"/>\
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
            var extendedPlayer=$('<ul class="dropdown-menu" role="menu"></ul>');
            miniPlayer=miniPlayer.add(extendedPlayer);
            var $commands=$('<li></li>');
            extendedPlayer.append($commands);
            $commands.append($('<a class="pause"><span class="fa fa-chevron-left"></span></a>').click(function(){
                commands.prev();
            }));
            $commands.append($('<a class="pause"><span class="fa fa-pause"></span></a>').click(function(){
                commands.pause();
            }));
            $commands.append($('<a class="pause"><span class="fa fa-chevron-right"></span></a>').click(function(){
                commands.prev();
            }));
            $('a', $commands).css('display', 'inline')

            socket.on('player.status', function(status){
                switch(status.state)
                {
                    case 'playing':
                        $('.pause, .stop', $commands).show();
                        $('.play', $commands).hide();
                        break;
                    case 'paused':
                        $('.pause, .stop', $commands).show();
                        $('.play', $commands).hide();
                        break;
                    default:
                        $('.pause, .stop', $commands).hide();
                        $('.play', $commands).show();
                        break;
                }
                $('.progress-bar', miniPlayer).css('width', status.position*100+'%', 1000);
            });
            
            socket.on('player.playlist', function(playlist){
                $('ul.playlist').empty();
                $.each(playlist, function(index, playItem){
                    
                    var item=$('<li>').text(playItem.displayName);
                    
                    item.on('click', function(){
                        commands.play(item.index());
                    });
                    if(playItem.active)
                    {
                        item.addClass('active');
                        $('.text', miniPlayer).text(playItem.displayName);
                    }
                    else
                        item.addClass('hidden-xs');
                    $('ul.playlist').append(item);
                    
                });
            });
            
            socket.on('player.art', function(img){
                if(typeof(img)!=='string')
                {
                    var blob = new Blob([img], {type: 'image/jpeg'}); // pass a useful mime type here
                    img=URL.createObjectURL(blob);
                }
                $('img.art').prop('src',img);
            });
            var module=$('<li class="dropdown" ></li>');
            module.prepend(miniPlayer);
            $('#modulePlaceHolder').prepend(module);
});
(function(){
    var playlist=[];
    
    function command(cmd)
    {
        return function(id){
            debugger;
            if(id || id===0)
                $.getJSON('/api/media/player/'+cmd+'/'+id+'?to='+player);
            else
                $.getJSON('/api/media/player/'+cmd+'?to='+player);
        };
    }
    
    function renderPlaylist()
    {
        $('#playlist').empty();
        $.each(playlist, function(index,item){
            var playItem=$('<li>').append($('<a>').text(item.displayName).on('click', function(){
                commands.play($(this).index(), item.id);
            })).appendTo('#playlist');
            if(player.prop('src').endsWith('/api/media/streamer/'+item.id))
                playItem.addClass('active');
        });
    }
    
    var player=$('<audio controls preload="auto" />');
    var preload=$('<audio controls preload="auto" />');
    
    var context=new (AudioContext || webkitAudioContext)();
    var playerSource=context.createMediaElementSource(player[0]);
    var preloadSource=context.createMediaElementSource(preload[0]);
    playerSource.connect(context.destination);
    preloadSource.connect(context.destination);
    
    player.add(preload).on('timeupdate', function(){
        var duration=player.prop('duration');
        var currentTime=player.prop('currentTime');
        if(duration-currentTime<2000 && this==player[0])
        {
            var currentItem=$.grep(playlist, function(item){
                return player.prop('src').endsWith('/api/media/streamer/'+item.id);
            });
            currentItemIndex=playlist.indexOf(currentItem[0]);
            if(currentItem.length>0 && currentItemIndex<playlist.length-1)
            {
                var nextItem=playlist[currentItemIndex+1];
                if(!preload.prop('src').endsWith('/api/media/streamer/'+nextItem.id))
                    preload.prop('src', '/api/media/streamer/'+nextItem.id);
            }
        }
    }).on('ended', function(){
        var swap=player;
        player=preload;
        preload=swap;
        player[0].play();
        renderPlaylist();
    });
    
    
    
    $.ajaxTransport('arraybuffer', function(options, originalOptions){
        if(window.ArrayBuffer && originalOptions.dataType=='arraybuffer')
        {
            return {
                send:function(headers, completeCallback)
                {
                    var xhr=options.xhr();
                    xhr.responseType=options.dataType;
                    xhr.addEventListener('load', function(){
                        var res={};
                        res[options.dataType]=xhr.response;
                        completeCallback(xhr.status, xhr.statusText, res, xhr.getAllResponseHeaders())
                    });
                    
                    xhr.open(options.type || 'GET', options.url || window.location.href, options.async || true);
                    xhr.send(options.data || null);
                },
                abort:function(){
                    xhr.abort();
                }
            }
        }
    });
    
    var fadeTime=2;
    
    var commands={
    	play: function(index, id){
    	    if(isNaN(Number(index)))
        	    commands.enqueue(index, function(){
        	        player.prop('src', '/api/media/streamer/'+index);
        	        player[0].play();
                    renderPlaylist();
        	    });
    	    else
        	{
    	        player.prop('src', '/api/media/streamer/'+id);
    	        renderPlaylist();
    	        player[0].play();
        	}        
    	},
    	enqueue:function(id, callback){
    	    $.getJSON('/api/media/library/item/'+id, function(result){
        	    playlist.push($.extend(result, {id:id}));
        	    if($('#playlist ul.dropdown .active').is(':last'))
        	        preload.prop('src', '/api/media/streamer/'+index)
        	    renderPlaylist();
        	    if(callback)
        	        callback(result);
    	    })
    	},
    	pause:command('pause'),
    	stop:command('stop'),
    	next:command('next'),
    	previous:command('previous'),
    	remove:command('remove'),
    	loop:command('loop'),
    	repeat:command('repeat'),
    	volume:command('volume'),
    	seek:command('seek'),
    	fullscreen:command('fullscreen'),
    };
})();
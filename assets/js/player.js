var player=null;
    
function switchPlayer(newPlayer)
{
    if(player!=null)
    {
        socket.emit('leave', player)
        $('.player-'+player).removeClass('active');
    }
        
    player=newPlayer.id;
    $('.player-switch .btn-label').text(newPlayer.name);
    socket.emit('join', 'player-'+player);
    $('.player-'+player).addClass('active');
    commands.playlist();
}

socket.on('iamaplayer', function(identity){
    if($('.player-switch').length-$('.player-switch li.player-'+identity.id).length==0)
        return;
    $('.player-switch:not(:has(li.player-'+identity.id+')) ul.dropdown-menu').append('<li class="player-'+identity.id+'">'+identity.name+'</li>').click(function(){
            switchPlayer(identity);
        });
    if(player==null && $('.player-switch:first li').length==1)
    {
        switchPlayer(identity);
        command('art')();
    }
});

socket.on('disconnect', function(){
    $('.player-switch').empty();
});

socket.on('reconnect', function(){
    socket.emit('whoisaplayer', {});
});

socket.on('iamnotaplayer', function(identity){
    if($('.player-'+identity.id).is('.active'))
    {
        if($('.player-switch:first ul.dropdown-menu li').length>1)
            $('.player-switch:first ul.dropdown-menu li:first').click();
        else
            $('.player-switch .btn-label').text(' ');
    }
    $('.player-'+identity.id).remove();
    
});

socket.emit('whoisaplayer', {});

function command(cmd)
{
    return function(id){
        if(id || id===0)
            $.getJSON('/api/media/player/'+cmd+'/'+id+'?to='+player);
        else
            $.getJSON('/api/media/player/'+cmd+'?to='+player);
    };
}

var commands={
	play: command('play'),
	enqueue:command('enqueue'),
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
	shutdown:command('shutdown'),
	random:command('random'),
	playlist: command('playlist'),
	dj:command('dj')
};

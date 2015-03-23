var player=null;
    
function switchPlayer(newPlayer)
{
    if(player!=null)
        socket.emit('leave', player)
    player=newPlayer.id;
    $('#player .btn-label').text(newPlayer.name);
    socket.emit('join', 'player-'+player);
    commands.playlist();
}

socket.on('iamaplayer', function(identity){
    if($('#player li#player-'+identity.id).length>0)
        return;
    $('#player ul.dropdown-menu').append('<li id="player-'+identity.id+'">'+identity.name+'</li>').click(function(){
            switchPlayer(identity)
        });
    if($('#player li').length==1)
        switchPlayer(identity);
});

socket.on('disconnect', function(){
    $('#player').empty();
});

socket.on('reconnect', function(){
    socket.emit('whoisaplayer', {});
});

socket.on('iamnotaplayer', function(identity){
    if($('#player-'+identity.id).is('.active'))
    {
        if($('#player ul.dropdown-menu li').length>1)
            $('#player ul.dropdown-menu li:first').click();
        else
            $('#player .btn-label').text('');
    }
    $('#player-'+identity.id).remove();
    
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
};

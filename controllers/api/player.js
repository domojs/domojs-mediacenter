function cmd(to, cmd, callback)
{
    $.emitTo('player.command', to, cmd);
    callback(200);
}

var djMode={};

module.exports={
    play:function(id, to, callback){
        $.db.hget(id, 'path', function(err, path){
            console.log('play '+path+' to '+to);
            if(path)
                $.db.set(id.substr(0,id.indexOf(':',id.indexOf(':')+1))+':lastPlayed', id, function(){
                    cmd(to, {name:'play', args:[path || id]}, callback);
                });
            else
                cmd(to, {name:'play', args:[path || id]}, callback);
        });
    },
    remove:function(id, to, callback)
    {
        cmd(to, {name:'remove', args:[id]}, callback);
    },
    enqueue:function(id, to, callback){
        $.db.hget(id, 'path', function(err, path){
            console.log('enqueing '+path+' to '+to);
            cmd(to, {name:'enqueue', args:[path]}, callback);
        });
    },
    seek:function(id, to, callback){
        cmd(to, {name:'seek', args:[id]}, callback);
    },
    volume:function(id, to, callback){
        cmd(to, {name:'volume', args:[id]}, callback);
    },
    random:function(id, to, repeat, callback){
        var self=this;
        repeat=repeat || 1;
        $.db.scard('media:'+id, function(error, count){
            if(error)
                return console.log(error);
            var randoms=[];
            for(var i=0;i<repeat;i++)
            {
                randoms.push(Math.floor(Math.random()*count));
            }
            $.eachAsync(randoms, function(index, random, next){
                $.db.sort('media:'+id, 'LIMIT', random, 1, 'GET', '#', 'ALPHA', function(err, items)
                {
                    if(err)
                        return console.log(err);
                    
                    self.enqueue(items[0], to, next);
                });
            }, callback);
        });
    },
    get:function(id, to, callback){
        cmd(to, {name:id, args:[]}, callback);
    },
    dj:function(id, to, callback)
    {
        var socket=require('socket.io-client')('http://localhost');
        socket.on('iamnotaplayer', function(identity){
            if(identity.id==to)
            {
                console.log('localServer');
                socket.emit('leave', 'player-'+identity.id);
                delete djMode[to];
            }
        });
        socket.emit('join', 'player-'+to);
        djMode[to]=socket;
        var randomizing=0;
        socket.on('player.playlist', function(playlist){
            if(randomizing>0)
            {
                randomizing--;
                return;
            }
            var historyCount=0;
            for(var i=0;i<playlist.length;i++)
            {
                if(!playlist[i].active)
                    historyCount++;
                else
                {
                    console.log('breaking at '+i);
                    break;
                }
            }
            console.log('history count: '+historyCount);
            
            if(historyCount<playlist.length-1 && historyCount==i && historyCount>0)
            {
                module.exports.remove(playlist[0].id, to, function(){});
                return;
            }
            if(randomizing===0 && playlist.length<21-historyCount)
            {
                randomizing=21-historyCount-playlist.length;
                module.exports.random('music', to, 21-historyCount-playlist.length, function(){
                    callback(200);
                    callback=function(){
                        
                    };
                });
            }
        });
        
        module.exports.get('playlist', to, function(){});
    }
};
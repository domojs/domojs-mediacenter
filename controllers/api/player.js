function cmd(to, cmd, callback)
{
    $.io.sockets.to(to).emit('player.command', cmd);
    callback(200);
}
module.exports={
    play:function(id, to, callback){
        $.db.hget(id, 'path', function(err, path){
            console.log('play '+path+' to '+to);
                $.db.set(id.substr(0,id.indexOf(':',id.indexOf(':')+1))+':lastPlayed', id, function(){
                    cmd(to, {name:'play', args:[path || id]}, callback);
                });
            
        });
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
                    
                    $.eachAsync(items, function(index, item, next){
                        self.enqueue(item, to, next);
                    }, next);
                });
            }, callback);
        });
    },
    get:function(id, to, callback){
        cmd(to, {name:id, args:[]}, callback);
    },
};
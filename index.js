exports.init=function(config, app)
{
    if(typeof($.settings('source:video'))=='undefined')
        $.settings("source:video",["//nas.dragon-angel.fr/mnt/HD/HD_a2/Videos"]);
    if(typeof($.settings('source:music'))=='undefined')
        $.settings("source:music",["//nas.dragon-angel.fr/mnt/HD/HD_b2/Music"]);
     
    function findClientsSocketByRoomId(roomId) {
        var res = []
        , room = $.io.sockets.adapter.rooms[roomId];
        if (room) {
            for (var id in room) {
            res.push($.io.sockets.adapter.nsp.connected[id]);
            }
        }
        return res;
    }
    
    $.io.on('connection', function(socket){
        
        var identity={ id: socket.id };
        var playlistId='media:playlist:'+identity.id;
        var mrl;
        var markedAsRead=false;
        var device=false;
        //player discovery
        socket.on('whoisaplayer', function(message, callback)
        {
            console.log('looking for players');
            console.log(findClientsSocketByRoomId('iamaplayer').length)
            $.io.sockets.emit('whoisaplayer', {replyTo:identity.id, ts: Number(new Date())});
        });
        socket.on('iamaplayer', function(message, callback){
            identity.name=message.identity;
            console.log(identity);
            if(message.replyTo)
            {
                $.emitTo('iamaplayer', message.replyTo, identity);
            }
            else
            {
                var cmd=function(cmd, args)
                {
                    return function(value, callback){
                        if(value)
                            if(typeof(args)!='undefined')
                                args.push(value);
                            else
                                args=[value];
                        socket.emit('player.command', {name:cmd, args:args || []});
                        if(callback)
                            callback(200);
                    }
                }
                $.io.sockets.emit('iamaplayer', identity);
                
                $.device(device={name:identity.name, type:'player', commands:{
                    pause:cmd('pause'),
                    stop:cmd('stop'),
                    next:cmd('next'),
                    previous:cmd('previous'),
                    fullscreen:cmd('fullscreen'),
                    off:cmd('shutdown'),
                }, subdevices:[
                    {
                        name:"volume",
                        type:'analogic',
                        category:'actuator',
                        /*status:function(callback)
                        {
                            var status={};
                            send('?V', device.name, function(error, result){
                                callback({state:/[0-9]+/.exec(result)*100/185});
                            });
                        },*/
                        commands:
                        {
                            'up':cmd('volume', ['+5']),
                            'down':cmd('volume', ['-5']),
                            'set':cmd('volume')
                        },
                    },
                ]});
            }
        });
        
        socket.on('disconnect', function(){
            console.log('notifying death of '+identity.id);
            $.io.sockets.emit('iamnotaplayer', identity);
            if(device)
            {
                device.remove();
            }
            $.db.del(playlistId, playlistId+':ids', function(err)
            {
                if(err)
                    console.log(err);
            });
        });

        // proxying playlist
        socket.on('player.playlist', function(message){
            
            var args=[playlistId];
            $.each(message, function(index, item){
                args.push(item.uri);
                if((!mrl || mrl!=item.uri) && item.current=='current')
                {
                    mrl=item.uri;
                    markedAsRead=false;
                    console.log('current item is '+mrl);
                    socket.emit('player.command',{name:'art', args:[]});
                    $.db.get(mrl, function(err, id){
                        if(id)
                            $.db.set(id.substr(0,id.indexOf(':',id.indexOf(':')+1))+':lastPlayed', id, $.noop);
                    });
                }
            });
            $.db.del(playlistId, playlistId+':ids', function(){
                $.db.rpush(args, function(){
                    $.db.sort(playlistId, 'BY', 'NOSORT', 'GET', '*', 'ALPHA', function(err, replies){
                        if(err)
                            console.log(err);
                        if(replies.length==0)
                            return $.emitTo('player.playlist', 'player-'+identity.id, []);
                        replies.unshift(playlistId+':ids')
                        $.db.rpush(replies, function(err, replies){
                            if(err)
                                console.log(err);
                            var columns=['displayName', 'path', 'id'];
                            args=[playlistId+':ids', 'BY', 'NOSORT'];
                            for(var c in columns)
                            {
                                args.push('GET');
                                if(columns[c]=='id')
                                    args.push('#');
                                else
                                    args.push('*->'+columns[c]);
                            }
                            args.push('ALPHA');
                            $.db.sort(args, function(err, replies){
                                var result=[];
                                for(var i=0; i<replies.length;)
                                {
                                    var item={};
                                    if(message[Math.floor(i/columns.length)])
                                        item.listId=message[Math.floor(i/columns.length)].id;
                                    for(var c in columns)
                                    {
                                        item[columns[c]]=replies[i++];
                                    
                                    }
                                    if(item.path==mrl)
                                        item.active=true;
                                    result.push(item);
                                }
                                $.emitTo('player.playlist', 'player-'+identity.id, result);
                            });
                        });
                    });
                });
            });
        });

        
        // proxying status
        socket.on('player.status', function(message){
            if(!markedAsRead && message.time/message.length>0.5)
            {
                markedAsRead=true;
                $.db.get(mrl, function(err, id){
                    if(err)
                    {
                        markedAsRead=false;
                        console.log(err);
                        return;
                    }
                    $.db.multi().
                        hset(id, 'lastread', new Date().toISOString()).
                        hincrby(id, 'readcount', 1).
                        exec(function(err){
                           if(err)
                           {
                               markedAsRead=false;
                               console.log(err);
                           }
                        })
                });
            }
            $.emitTo('player.status', 'player-'+identity.id, message);
        });
        
        // proxying art
        socket.on('player.art', function(message){
            var callback=function(img)    
            {        
                $.emitTo('player.art', 'player-'+identity.id, 'data:image/jpeg;base64,'+img);
            };
            var setArtwork=function(id, url){
                $.ajax({url:url}).on('response', function (res) {
                    var chunks=[];
                    if(res.statusCode==301 || res.statusCode==302 ||res.statusCode==307)
                        return $.ajax({url:res.headers.location}).on('response', arguments.callee);
                    res.on('data', function(chunk){
                        chunks.push(chunk);
                    });
                    res.on('end', function(chunk){
                        if(chunk)
                            chunks.push(chunk);
                        var img=Buffer.concat(chunks).toString('base64');
                        $.db.hset(id, "cover", img, function(err){
                            if(err)
                                console.log(err);
                            else
                            {
                                console.log('set art to '+url);
                                callback(img);
                            }
                        });
                    });
                });
            };

            //console.log(message);
            if(message.length==0 || message.toString('ascii')!='Error')
            {
                console.log('looking for art');
                $.db.get(mrl, function(err, id){
                    if(id==null)
                        return;
                    console.log(id);
                    var mediaType=id.split(':')[1];
                    $.db.hgetall(id, function(err, media){
                        //console.log(media);
                        if(media.cover && media.cover!='undefined')
                        {
                            return callback(media.cover);
                        }
                        if(mediaType=='music')
                        {
                            $.ajax({type:'get', dataType:'json', url:'http://mb.videolan.org/ws/2/release/?fmt=json&query=artist:%22'+media.artist+'%22%20AND%20release:%22'+media.album+'%22', success:function(data)
                            {
                                console.log('looked for art');
                                if(data.count>0)
                                {
                                    var matchingAlbums=$.grep(data.releases, function(item){
                                        return Number(item.score)==100 && item.asin && $.grep(item.media, function(media){ return media.format!='Digital Media' }).length>0;
                                    });
                                    
                                    if(matchingAlbums.length==0)
                                    {
                                        matchingAlbums=$.grep(data.releases, function(item){
                                            return Number(item.score)==100 && $.grep(item.media, function(media){ return media.format!='Digital Media' }).length>0;
                                        });
                                    }
                                
                                    if(matchingAlbums.length>0)
                                    {
                                        return (function(i){
                                            var func=arguments.callee;
                                            console.log(i);
                                            $.ajax({type:'get', dataType:'json', url:'http://mb.videolan.org/ws/2/release/'+matchingAlbums[i].id+'?fmt=json&inc=recordings', success:function(data){
                                    
                                                if(data.asin)
                                                    setArtwork(id, 'http://images.amazon.com/images/P/'+data.asin+'.01._SCLZZZZZZZ_.jpg');
                                                else if(data['cover-art-archive'] && data['cover-art-archive'].front)
                                                {
                                                    $.ajax({type:'get', dataType:'json', url:'http://coverartarchive.org/release/'+matchingAlbums[i].id, success:function(data){
                                                        var front=$.grep(data.images, function(image){
                                                            return image.front;
                                                        });
                                                        console.log(front);
                                                        setArtwork(id, front[0].image);
                                                    }});
                                                }
                                                else if(i<matchingAlbums.length-1)
                                                    func(++i);
                                            }});	
                                        })(0);
                                    }
                                }
                            }, error:function(error){
                                console.log('could not find art');
                            }});
                        }
                        else if(mediaType=='video')
                        {
                            $.getJSON('http://private-f864a-themoviedb.apiary-proxy.com/3/configuration?api_key=be3bc153ce74463263960789c93e29a9', function(config){
                                if(media.episode)
                                {
                                    $.getJSON('http://private-f864a-themoviedb.apiary-proxy.com/3/search/tv?api_key=be3bc153ce74463263960789c93e29a9&query='+media.name, function(results){
                                        if(results.total_results>0)
                                        {
                                            (function(i){
                                                var item=results.results[i];
                                                if(media.season)
                                                {
                                                    $.ajax('http://private-f864a-themoviedb.apiary-proxy.com/3/tv/'+item.id+'/season/'+media.season+'?api_key=be3bc153ce74463263960789c93e29a9', {success:function(season){
                                                        if(season.poster_path===null && media.season>1)
                                                        {
                                                            $.ajax('http://private-f864a-themoviedb.apiary-proxy.com/3/tv/'+item.id+'/season/1?api_key=be3bc153ce74463263960789c93e29a9', {success:function(season){
                                                                setArtwork(id, config.images.base_url+'original'+season.poster_path)
                                                            }, error:function(error){
                                                                console.log(error);
                                                            }});
                                                        }
                                                        else
                                                            setArtwork(id, config.images.base_url+'original'+season.poster_path)
                                                    }, error:function(error){
                                                        console.log(error);
                                                    }});
                                                }
                                                else
                                                {
                                                    setArtwork(id, config.images.base_url+'original'+item.poster_path);
                                                }
                                            })(0);
                                        }
                                    });
                                }
                                else
                                {
                                    $.getJSON('http://private-f864a-themoviedb.apiary-proxy.com/3/search/movie?api_key=be3bc153ce74463263960789c93e29a9&query='+media.name, function(results){
                                        if(results.total_results>0)
                                        {
                                            (function(i){
                                                var item=results.results[i];
                                                setArtwork(id, config.images.base_url+'original'+season.poster_path)
                                            })(0);
                                        }
                                    });
                                }
                            });
                        }
                    });
                });
            }
            else
                callback(message);
        });
        
        // proxying commands
        socket.on('player.command', function(message){
            console.log('sending command '+message.command+' to '+message.to);
            $.emitTo('player.command', message.to, message.command);
        });
    });
};

var debug=$('debug')('media');

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

module.exports={
    item:function(db, id, callback){
        db.hgetall(id, function(error, result){
            if(error)
                console.log(error);
            callback(result);
        });
    },
    get:function(db, id, viewName, draw, length, start, search, callback)
    {
        if(typeof(search)=='undefined')
            search=this.request.query['search[value]'].toLowerCase();

		var self=this;
		
        if(search)
        {
            db.select(0, function(error){
                if(error)
                {
                    console.log(error);
                }
                db.del('media:search', function(error, result){
                    if(error)
                    {
                        console.log(error);
                    }
                    var args=['media:search', 'media:'+id];
                    if(viewName=='thumbnails')
                    {
                        args[0]+=':index';
                        args[1]='index:'+id;
                    }
                        
                    
                    $.each(search.split(' '), function(index, token)
                    {
                        args.push('tokens:'+id+':'+token);
                    });
                    console.log('sinterstore '+args.join(' '));
                    db.sinterstore(args, function(error, results){
                        if(error)
                            console.log(error);
                        module.exports.get.call(self, db, id, viewName, draw, length, start, false, callback);
                        
                    });
                });
            });
            return;
        }
        
		var columns=[];
		switch(id)
		{
            case 'music':
                columns.push('id');
                columns.push('name');
                columns.push('trackNo');
                columns.push('artist');
                columns.push('album');
                columns.push('readcount');
                break;
            case 'video':
                columns.push('id');
                columns.push('name');
                if(viewName!='thumbnails')
                {
                    columns.push('episode');
                    columns.push('season');
                    columns.push('readcount');
                }
                break;
		}
		if(search===false)
		{
            id='search';
            if(viewName=='thumbnails')
                id='search:index';
		}
        console.log('library '+id+' LIMIT '+start+','+length);
        db.select(0, function(error){
            if(error)
            {
                console.log(error);
                return callback(500, error);
            }
    		db.scard('media:'+id, function(error, count){
                if(error)
                {
                    console.log(error);
                    return callback(500, error);
                }
                console.log(count+' found');
            
                db.osort('media:'+id, columns, viewName=='thumbnails' && '*->lastRead' || 0, start, start && (length || 100), function(error, result){
                    if(error)
                    {
                        console.log(error);
                        return callback(500, error);
                    }
                    callback({
                        draw:draw,
                        recordsTotal:count,
                        recordsFiltered:count,
                        data:result
                        });
                });
            });
        });
    },
    hasNext:function(db, id, callback)
    {
        id=decodeURIComponent(id);
        var fragments=id.split(':');
        var tryFind=function(index)
        {
            fragments[index]=Number(fragments[index]);
            if(isNaN(fragments[index]))
                return callback(404);
            fragments[index]=pad(++fragments[index], 3);
            var nextId=fragments.join(':');
            db.select(0, function(){
                db.exists(nextId, function(error, exists){
                    if(exists)
                        callback(nextId);
                    else 
                    {
                        fragments[index]--;
                        tryFind(--index);
                    }
                });
            })
        };
        tryFind(fragments.length-1);
    },
    getArt:function(db, id, callback)
    {
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
                    db.hset(id, "cover", img, function(err){
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
        
        if(id==null)
            return;
        console.log(id);
        var ids=id.split(':');
        if(ids.length<2)
            callback(400);
        var mediaType=ids[1];
        db.hgetall(id, function(err, media){
            var process=arguments.callee;
            if(err!=null)
            {
                console.log(err);
                callback(500, err);
                return;
            }
            if(media.cover && media.cover!='undefined')
            {
                return callback(media.cover);
            }
            if(media.index)
            {
                db.hgetall(media.index, function(err, index){
                    var oldcallback=callback;
                    callback=function(img)
                    {
                        if(!isNaN(img))
                            oldcallback(img);
                        db.hset(id, "cover", img, function(err){
                            if(err)
                                console.log(err);
                            else
                            {
                                oldcallback(img);
                            }
                        });
                    }
                    index.season=media.season;
                    index.episode=media.episode;
                    index.album=media.album;
                    index.artist=media.artist;
                    process(null, index);
                })
                return;
            }
            return callback(404);
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
                                    else
                                        callback(404);
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
                                $.eachAsync(results.results, function(i, item, next){
                                    if(media.season)
                                    {
                                        $.ajax('http://private-f864a-themoviedb.apiary-proxy.com/3/tv/'+item.id+'/season/'+media.season+'?api_key=be3bc153ce74463263960789c93e29a9', {success:function(season){
                                            if(season.poster_path===null && media.season>1)
                                            {
                                                $.ajax('http://private-f864a-themoviedb.apiary-proxy.com/3/tv/'+item.id+'/season/1?api_key=be3bc153ce74463263960789c93e29a9', {success:function(season){
                                                    setArtwork(id, config.images.base_url+'original'+season.poster_path)
                                                }, error:function(error){
                                                    console.log(error);
                                                    next();
                                                }});
                                            }
                                            else if(season.poster_path!=null)
                                                setArtwork(id, config.images.base_url+'original'+season.poster_path)
                                            else
                                                next();
                                        }, error:function(error){
                                            console.log(error);
                                            next();
                                            
                                        }});
                                    }
                                    else
                                    {
                                        setArtwork(id, config.images.base_url+'original'+item.poster_path);
                                    }
                                }, function(){
                                    callback(404);
                                });
                            }
                            else
                                callback(404);
                        });
                    }
                    else
                    {
                        $.getJSON('http://private-f864a-themoviedb.apiary-proxy.com/3/search/movie?api_key=be3bc153ce74463263960789c93e29a9&query='+media.name, function(results){
                            if(results.total_results>0)
                            {
                                (function(i){
                                    var item=results.results[i];
                                    setArtwork(id, config.images.base_url+'original'+item.poster_path)
                                })(0);
                            }
                            else
                                callback(404);
                        });
                    }
                });
            }
        });
    }
};
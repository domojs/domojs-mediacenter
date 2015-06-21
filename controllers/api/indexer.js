var debug=function(){ console.log.apply(console, arguments) };
var id3=require('musicmetadata');
var md5=require('md5');
var levenshtein=require('levenshtein');

folderMapping=false;

var processing=false;
var wasProcessing=false;
var interval=setInterval(function(){
    if(processing)
    {
        console.log(processing);
        wasProcessing=processing;
    }
    else if(wasProcessing)
        {
            console.log('process finished');
            wasProcessing=false;
        }
    }, 10000);

function processFolder(folder, extension, lastIndex, callback)
{
    $('fs').readdir(translatePath(folder), function(err, files){
        var result=[];
        if(err)
        {
            console.log(err);
            callback(err);
        }
        else
        $.eachAsync(files, function(index, file, next){
            if(file=='$RECYCLE.BIN' || file=='.recycle')
                return next();
            file=folder+'/'+file;
            $('fs').stat(translatePath(file), function(err, stat){
                if(err)
                {
                    debug(err);
                    next();
                }
                if(stat.isDirectory())
                    processFolder(file, extension, lastIndex, function(results){
                        result=result.concat(results);
                        next();
                    });
                else 
                {
                    if(extension.test(file) && stat.mtime>lastIndex)
                        result.push(file);
                    next();
                }
            });
        }, function(){
            callback(result);
        });
    });
}

function fileNameCleaner(fileName, extension)
{
    while(fileName.startsWith('/'))
        fileName=fileName.substr(1);
    var encodedUriMatches=fileName.match(/%[0-9a-f]{2}/gi);
    if(encodedUriMatches && encodedUriMatches.length>1)
        fileName=decodeURIComponent(fileName);
    // keep only files
    fileName=fileName.replace(/^([^\/]+\/)+([^\/]+)$/g, '$2');
    //trimming extension
    fileName=fileName.replace(extension, '');
    //trimming endTags
    fileName=fileName.replace(/(\[[A-F0-9]+\])*$/i, '');
    //trimming codecs and format
    fileName=fileName.replace(/(^(\[[^\]]+\]_?)(\[[^\]]{2,7}\])?)|((1080|720)[pi])|[0-9]{3,4}x[0-9]{3,4}|([XH]\.?)264|xvid|ogg|mp3|ac3|\+?aac|rv(9|10)e?([_-]EHQ)?|multi|vost(f(r)?)?|real|(?:true)(?:sub)?(?:st)?fr(?:ench)?|5\.1|dvd(rip(p)?(ed)?)?|bluray|directors\.cut|web-dl|\.V?[HLS][QD]|fin(al)?|TV|B(?:R)?(?:D)(rip(p)?(ed)?)?|v[1-9]/gi, '');
    //checksum
    fileName=fileName.replace(/(\[[A-F0-9]+\]|\(_CRC[A-F0-9]+\))$/i, '');
    //other checksum format
    fileName=fileName.replace(/\[[a-f0-9]{6,8}\]/i, '');
    //team specification at the beginning of the file name
    fileName=fileName.replace(/^([A-Z]+-)/i, '');
    //team specification at the end of the file name
    fileName=fileName.replace(/([A-Z]+-)$/i, '');
    //normalizing separators to a dot
    fileName=fileName.replace(/[-\._ ]+/g, '.');
    //trimming end tags
    fileName=fileName.replace(/\[[^\]]+\]\.?$/, '');
    //removing empty tags
    fileName=fileName.replace(/\[[\.+-]?\]/g, '');
    //removing empty tags with braces
    fileName=fileName.replace(/\{[\.+-]?\}/g, '');
    //removing empty tags with parent
    fileName=fileName.replace(/\([\.+-]?\)/g, '');
    //removing dates
    fileName=fileName.replace(/\[[0-9]{2}\.[0-9]{2}\.[0-9]{4}\]/, '');
    fileName=fileName.replace(/[0-9]{4}/, '');
    //trimming start for dots and spaces
    fileName=fileName.replace(/^[ \.]/g, '');
    //trimming end for dots
    fileName=fileName.replace(/[\. ]+$/, '');
    return fileName;
}

var coverQueue=new Queue(function(media, next)
{
    tvdbScrapper(media.mediaType, media, function(){
            var db=$.db.another();
            if(media.cover)
                $.ajax({url:media.cover}).on('response', function (res) {
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
                        if(media.tvdbid==75001 || media.tvdbid==81877 || media.tvdbid==220911)
                        {
                            //console.log(media.overview);
                            //console.log(img.length);
                            //console.log(media.tvdbid);
                            media.overview='';
                        }
                        db.multi()
                            .hmset(media.id, 'cover', img, 'tvdbid', media.tvdbid, 'overview', media.overview)
                            .hmset(media.index, 'cover', img, 'tvdbid', media.tvdbid, 'overview', media.overview)
                            .exec(function(error, replies)
                            {
                                //console.log(arguments);
                                db.quit();
                                next();
                            });
                    });
                });
            else
                db.multi()
                    .hmset(media.id, 'tvdbid', media.tvdbid || '', 'overview', media.overview || '')
                    .hset(media.index, 'tvdbid', media.tvdbid || '', 'overview', media.overview || '')
                    .exec(function(error, replies)
                    {
                        //console.log(arguments);
                        db.quit();
                        next();
                    });
        }, function(){
            //console.log(media);
            next();
        });
})

function videoScrapper(mediaType, media, callback, errorCallback)
{
    var episodeNumber = /(?:\.E(?:p(?:isode)?)?|Part|Chapitre)\.?([0-9]+)/i;
    var seasonNumber = /(?:\.S(?:aison)?)([0-9]+)/i;
    var name = /(([A-Z!][A-Z!0-9]*|[A-Z!0-9]*[A-Z!])+(\.|$))+/i;
    var season = seasonNumber.exec(media.name);
    var episode = episodeNumber.exec(media.name);
    var itemName=media.name.replace(extensions[mediaType], '');
    if(!episode || !episode[1])
    {
        if(!season)
        {
            episode=/([0-9]+)(?:x|\.)([0-9]+)/.exec(media.name);
            if(episode && episode[2])
            {
                season=episode;
                episode={'1':episode[2],index:episode.index};
            }
            else
            {
                console.log(media.name);
                episode=/(?:\.S(?:aison)?)([0-9]+)(?:E(?:p(?:isode)?)?|Part|Chapitre)\.?([0-9]+)/i.exec(media.name);
                if(episode && episode[2])
                {
                    season=episode;
                    episode={'1':episode[2],index:episode.index};
                }
                else
                    episode=/(?:[^0-9]|^)([0-9]{1,3})(?:[^0-9]|$)/.exec(media.name);
            }
        }
        else
        {
            if(season && season[0])
            {
                media.name=media.name.substring(0,season.index)+media.name.substring(season.index+season[0].length);
                season[0]=false;
            }
            episode=/(?:[^0-9]|^)([0-9]{1,3})(?:[^0-9]|$)/.exec(media.name);
        }
    }
    if(episode && episode[0])
    {
        media.name=media.name.substring(0,episode.index)+media.name.substring(episode.index+episode[0].length);
    }
    if(season && season[0])
    {
        media.name=media.name.substring(0,season.index)+media.name.substring(season.index+season[0].length);
    }
    var maxLength=Math.min(season && season.index || media.name.length,episode && episode.index || media.name.length);
        if(episode!==null && episode && episode[1])
            episode=episode[1];
    itemName=name.exec(media.name);
    
    if(itemName)
    {
        if(itemName.index+itemName[0].length>maxLength)
            itemName=itemName[0].substr(0,maxLength);
        else
            itemName=itemName[0];
    }
    else
        itemName=media.name;
    itemName=itemName.replace(/prologue|oav/gi, '').replace(/\./g, ' ').replace(/ $/, '');
    var args={mediaType:mediaType, path:media.path, name:itemName, displayName:itemName};
    var finishProcessing=function(){
        var itemId=('media:'+mediaType+':'+args.name.replace(/ /g, '_')+(season && ':'+pad(season[1],2) || '')+(episode && ':'+pad(episode,3) || '')).toLowerCase();
        console.log(media.name);
        console.log(args.name);
        media.name=args.name.toLowerCase();
        media.id=itemId;
        if(season)
        {
            args.season=Number(season[1]);
            args.displayName=args.displayName+' - S'+Number(season[1]);
        }
        if(episode)
        {
            args.episode=media.episode=Number(episode);
            args.displayName=args.displayName+' - E'+Number(episode);
        }
        media.index=args.index='index:video:'+args.name.toLowerCase();
        if(args.episode==1 || !args.episode)
            coverQueue.enqueue(media);
    
        callback({args:args, id:itemId, tokens:args.displayName.split(' ').concat(media.path.split(/[ \/]/g))});
    };
    tvdbScrapper(mediaType, args, finishProcessing, finishProcessing);
}

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function translatePath(path){
    if(path.startsWith('//') && process.platform!='win32')
    {
        path=path.substring(2).replace(/\//g, $('path').sep);
        var indexOfSlash=path.indexOf($('path').sep);
        path=path.substring(0,indexOfSlash)+':'+path.substring(indexOfSlash);
        if(!folderMapping)
        {
            folderMapping={};
            var fstab=$('fs').readFileSync('/etc/fstab', 'ascii');
            var declarations=fstab.split(/\n/g);
            $.each(declarations, function(index, line){
                var declaration=line.split(/[ \t]/g);
                if(typeof(line)!='undefined' && declaration.length>1)
                {
                    folderMapping[declaration[0]]=declaration[1]
                }
            });
            console.log(folderMapping);
        }
        $.each(folderMapping, function(remotePath, localPath){
            if(path.startsWith(remotePath))
                path=path.replace(remotePath, localPath);
        });
    }
    return path;
}

function musicScrapper(mediaType, media, callback, errorCallback)
{
    try{
        var path=translatePath(media.path);
        var file=$('fs').createReadStream(path);
        id3(file, function(error, tags){
            if(error)
            {
                errorCallback(error);
                return;
            }
            media.mediaType=mediaType;
            media.name=tags.title;
            media.artist=tags.artist && tags.artist[0] || 'Artiste inconnu';
            media.album=tags.album;
            media.year=tags.year;
            media.trackNo=tags.track.no;
            media.albumTracks=tags.track.of;
            media.diskNo=tags.disk.no;
            media.disks=tags.disk.of;
            media.size=$('fs').statSync(path).size;
            media.length=tags.duration;
            media.index='index:music:'+media.artist+':'+media.album;
            if(tags.artist && tags.artist[0])
                media.displayName=media.name+' - '+media.artist;
            else
                media.displayName=media.name;
            media.cover=tags.picture && tags.picture[0] && tags.picture[0].data.toString('base64');
            var indexes=[];
            for(var artist in tags.artist)
                indexes.push('media:music:artist:'+artist);
            for(var artist in tags.albumartist)
                indexes.push('media:music:artist:'+artist);
            indexes.push('media:music:album:'+tags.album);
            indexes.push('media:music:name:'+tags.title);
            file.destroy();
            callback({
                id:'media:'+mediaType+':'+media.artist+':'+media.album+':'+pad(media.trackNo, 3), 
                tokens:tags.title.split(' ').concat(tags.album.split(' ')).concat(tags.artist.join(' ').split(' ')).concat(tags.albumartist.join(' ').split(' ')), 
                args:media,
                indexes:indexes
            });
        }).on('done', function (err) {
            if (err) 
            {
                errorCallback(err);
                file.destroy();
            }
        });
    }
    catch(err)
    {
        console.log(err);
        $.db.sadd('media:'+mediaType+':failedToIndex', media.path, function(){
            console.log('added '+media.path+' to failed to index list');
            callback();
        });
    }
}

function errorCallback(err){
            console.log(err);
            $.db.sadd('media:'+mediaType+':failedToIndex', path, function(){
                console.log('added '+path+' to failed to index list');
                callback();
            });
        }

function indexer(mediaType, scrapper, callback)
{
    $.db.spop('media:'+mediaType+':toIndex', function(err, path)
    {
        if(err)
            console.log(err);
        if(!path)
            return processing=false;
        var item={name:fileNameCleaner(path, extensions[mediaType]), path:path};
        scrapper(mediaType, item, function(result){
            if(result){
                var args=[result.id];
                result.args.path='file:///'+result.args.path;
                result.args.added=new Date().toISOString();
                $.each(Object.keys(result.args), function(index, key){
                    args.push(key);
                    args.push(result.args[key]);
                });
                var multi=$.db.multi()
                    .hmset(args)
                    .hmset(result.args.index, 'name', result.args.name)
                    .set(result.args.path, result.id)
                    .sadd('media:'+mediaType, result.id)
                    .sadd('index:'+mediaType, result.args.index);
                    
                if(result.args.episode)
                {
                    multi.
                        sadd(result.args.index+':episodes', result.id).
                        hmset(result.args.index, 'season', result.args.season || 1);
                    if(result.args.cover)
                        multi.hset(result.args.index, 'cover', result.args.cover);
                }
                if(result.args.trackNo)
                    multi.sadd(result.args.index+':tracks', result.id, 'album', result.args.album, 'artist', result.args.artist);
                if(result.indexes)
                    for(var index in result.indexes)
                        multi.sadd(result.indexes[index], result.id);
                $.each(result.tokens, function(index, token)
                {
                    if(token!='-')
                        multi.sadd('tokens:'+mediaType+':'+token.replace(/ /g, '_').toLowerCase(), result.id, result.args.index);
                });
                multi.exec(function(err, replies)
                {
                    if(err)
                        console.log(err);
                    process.nextTick(function(){
                        indexer(mediaType, scrapper, callback, errorCallback);
                    });
                });
                //debug(result.id);
            }
            else
                process.nextTick(function(){
                    indexer(mediaType, scrapper, callback, errorCallback);
                });

        });
    });
    
    $.db.set('media:'+mediaType+':lastIndex', new Date().toISOString(), function(err){
        if(err)
            console.log(err);
    });
    callback(200);
}

var extensions={video:/\.(avi|mkv|flv|mp4|mpg|ts)$/i, music: /\.(mp3|fla|flac|m4a)$/i};
var scrappers={video:videoScrapper, music:musicScrapper};

var tvdbMirrors=false;
var tvdbCache={};
function tvdbScrapper(mediaType, media, callback, errorCallback){
    if(!tvdbMirrors)
    {
        $.ajax({
            type:'get',
            url:'http://thetvdb.com/api/833A54EE450AAD6F/mirrors.xml',
            dataType:'xml',
            success:function(data){
                tvdbMirrors=data.Mirrors.Mirror;
                tvdbScrapper(mediaType, media, callback, errorCallback);
            },
            error:function(err)
            {
                console.log(err);
            }
        });
        return;
    }
    var mirror=tvdbMirrors[Math.floor(Math.random()*tvdbMirrors.length)].mirrorpath[0];
    var buildPath=function(Series, confidence)
    {
        if(Series.Overview)
            media.overview=Series.Overview[0];
        media.tvdbid=Series.seriesid[0];
        if(confidence>0.8)
            media.name=Series.SeriesName[0];
        var newName=media.displayName;
        newName+=$('path').extname(media.path);
        $.ajax({
            url:mirror+'/api/833A54EE450AAD6F/series/'+media.tvdbid+'/fr.xml',
            dataType:'xml',
            success:function(data){
                data=data.Data.Series;
                Series=data[0];
                //console.log(confidence);
                //console.log(Series.Genre);
                if(Series.poster && Series.poster[0] && (media.episode==1 || !media.episode))
                    media.cover=mirror+'/banners/'+Series.poster[0];
                if(Series.Genre[0].indexOf('|Animation|')>-1)
                    if(confidence>0.5)
                    {
                        callback('Animes/'+Series.SeriesName[0]+'/'+newName);
                    }
                    else
                    {
                        callback('Animes/'+(media.originalName || media.name)+'/'+newName);
                    }
                else
                {
                    callback('TV Series/'+Series.SeriesName[0]+'/'+newName);
                }
            },
            error:function(err)
            {
                console.log(err);
                errorCallback(err);
            }
        });
    };
    var confidence=function(name, names){
        var max=0;
        name=name.toLowerCase().replace(/[^A-Z0-9 ]/gi, '');
        if(names)
            $.each(names, function(i,n){
                var tokens=n.replace(/ \([0-9]{4}\)$/, '').replace(/[^A-Z0-9 ]/gi, '').toLowerCase();
                var lev=new levenshtein(name, tokens).distance;
                var c=1-lev/tokens.length;
                if(lev<3 && c>=max)
                {
                    max=c;
                }
                tokens=tokens.split(' ');
                var match=$.grep(tokens, function(token)
                {
                    var indexOfToken= name.indexOf(token);
                    return token.length>0 && indexOfToken>-1 && (indexOfToken+token.length == name.length || /^[^A-Z]/i.test(name.substring(indexOfToken+token.length)));
                });
                c= match.length/name.split(' ').length*match.length/tokens.length;
                if(c>=max)
                    max=c;
            });
        return max;;
    };
    function handleResults(data){
            if(!tvdbCache[media.name])
                tvdbCache[media.name]=data;
            data=data.Data;
            /*if(media.name.toLowerCase()=='forever')
            {
                console.log(data.Series);
            }*/
            if(data && data.Series && data.Series.length==1)
            {
                return buildPath(data.Series[0], confidence(media.name, data.Series[0].SeriesName));
            }
            else if(data && !data.Series)
            {
                var splittedName=media.name.split(' ');
                if(splittedName.length>1)
                {
                    return tvdbScrapper(mediaType, $.extend({}, media, {name:splittedName[0], originalName:media.name}), callback, function(){
                        tvdbScrapper(mediaType, $.extend({}, media, {name:splittedName[1], originalName:media.name}), callback, errorCallback);
                    });
                }
                else
                    return errorCallback();
            }
            else
            {
                var name=media.originalName || media.name;
                var max=0;
                var matchingSeries=false;
                if(data)
                {
                    $.each(data.Series, function(index, serie){
                        var c=confidence(name, serie.SeriesName);
                        if(c>=max)
                        {
                            if(matchingSeries)
                                console.log('replacing '+matchingSeries.SeriesName+'('+max+') by '+serie.SeriesName+'('+c+')');
                            max=c;
                            matchingSeries=serie;
                        }
                    });
                
                    if(!matchingSeries)
                    {
                        console.log('trying aliases for '+name);
                        $.each(data.Series, function(index, serie){
                            if(!serie.AliasNames)
                                return;
                            var c=confidence(name,serie.AliasNames[0].split('|'));
                            if(c>max)
                            {
                                max=c;
                                matchingSeries=serie;
                            }
                        });
                    }
                }
                if(matchingSeries)
                    buildPath(matchingSeries, max);
                else
                {
                    console.log('could no find a matching serie for '+name);
                    if(data)
                        console.log(data.Series);
                    return errorCallback();
                }
            }
        }
        if(tvdbCache[media.name])
            handleResults(tvdbCache[media.name]);
        else
            $.ajax({
                type:'GET',
                url:mirror+'/api/GetSeries.php',
                dataType:'xml',
                data:{seriesname:media.name, language:'fr', user:'721BD243D324D1BD'},
                success:handleResults
            });
}

function guessPath(media, callback)
{
    var newPath='';
    switch(media.mediaType)
    {
        case 'music':
            if(media.isCompilation)
                newPath+='Compilations/';
            else
                newPath+=media.artist+'/';
            newPath+=media.album+'/';
            if(media.discNo)
            newPath+=media.discNo+'.';
            newPath+=media.trackNo+' - '+media.name;
            newPath+=$('path').extname(media.path);
            callback(newPath);
            break;
        case 'video':
            if(media.episode==media.season && typeof(media.episode)=='undefined')
                callback('Movies/'+media.displayName+$('path').extname(media.path));
            else
                tvdbScrapper(media.mediaType, media, callback, function(){
                    console.log('unable to build path for media');
                    console.log(media);
                    callback(false);
                });
            break;
    }
}

function mkdirp(path, callback)
{
    $('fs').exists(path, function(exists){
        if(!exists)
            mkdirp($('path').dirname(path), function(err){
                if(err)
                    callback(err);
                else
                    $('fs').mkdir(path, callback)
            });
        else
            callback();
    })
}

function getNonExisingPath(path, callback)
{
    var trial=function(i)
    {
        console.log(i);
        var trialPath=path;
        if(i>0)
        {
            var p=$('path');
            trialPath=p.join(p.dirname(path), p.basename(path, p.extname(path))+' '+i+p.extname(path));
        }
        $('fs').exists(trialPath, function(exists)
        {
            console.log(trialPath);
            if(!exists)
            {
                callback(trialPath);
                return;
            }
            else
            {
                trial(i+1);
            }
        });
    }
    trial(0)
}

module.exports={
    dropbox:function(id, name, season, episode, album, artist, callback)
    {
        var indexers=10;
        var sources=$.settings('source:dropbox') || [];
        var result=[];
        if(processing)
            callback(404);
        processing='processing folders';
        var extension=extensions[id];
        var lastIndex=new Date(0);
        var matcher=function(item)
        {
            return (!name || item.name==name) && 
                   (!season || item.season==season) &&
                   (!episode || item.episode==episode) &&
                   (!album || item.album==album) &&
                   (!artist || item.artist==artist);
        }
        $.eachAsync(sources, function(index,source,next)
        {
            processFolder(source, extension, lastIndex, function(media){
                result=result.concat(media);
                next();
            });
        }, function(){ 
            debug('found '+result.length+' new '+id+'(s)');
            processing='processing indexation';
            var trueResult=[];
            $.eachAsync(result, function(index, path, next){
                console.log(path);
                scrappers[id](id, {name:fileNameCleaner(path, extensions[id]), path:path}, function(item){
                    if(item && matcher(item.args))
                        trueResult.push(item.args);
                    next();
                });
            }, function(){
                processing=false;
                callback(trueResult);
            })
        });
    },
    import:function(id, name, season, episode, album, artist, callback){
        var self=this;
        var newTarget=$.settings('source:'+id) || [];
        if(newTarget.length===0)
            return callback(500, 'No source for '+id);
        newTarget=newTarget[0];
        if(processing)
            return callback(404);
        this.dropbox(id, name, season, episode, album, artist, function(result){ 
            var paths=[];
            processing='importing';
            callback(result);
            $.eachAsync(result, function(i, media, next)
            {
                $.emit('message', 'importing '+media.displayName);
                guessPath(media, function(path){
                    if(path)
                    {
                        path=$('path').join(newTarget, path);
                        $('fs').stat(media.path, function(err, stats){
                            var src=$('fs').createReadStream(media.path);
                            
                            mkdirp($('path').dirname(path), function(err){
                                if(err)
                                {
                                    console.log(err)
                                    next();
                                    return;
                                }
                                console.log('path created if necessary');
                                getNonExisingPath(path, function(path){
                                    console.log('copying '+media.path+' to '+path);
                                    var size=0;
                                    var lastPercent=0;
                                    var target=$('fs').createWriteStream(path);
                                    
                                    src.pipe(target);
                                    src.on('data', function(buf){
                                        size+=buf.length;
                                        $.emit('media.import.status', {name:media.displayName, progress:size/stats.size});
                                        var newPercent=size/stats.size*100;
                                        if(Math.floor(newPercent)>lastPercent)
                                        {
                                            lastPercent=newPercent;
                                            console.log(size/stats.size*100+'%')
                                        }
                                    });
                                    src.on('end', function()
                                    {
                                        console.log('copied '+media.path+' to '+path);
                                        $('fs').unlink(media.path);
                                        paths.push(path);
                                        next();
                                    });
                                    target.on('error', function(err){
                                        console.log('could not copy '+media.path+' to '+path);
                                        console.log(err);
                                    });
                                });
                            })
                            console.log('copying '+media.path+' to '+path);
                        });
                    }
                    else 
                        next();
                });
            }, function(){
                if(paths.length===0)
                {
                    processing=false;
                    return;
                }
                paths.unshift('media:'+id+':toIndex');
                $.db.sadd(paths, function(err, result)
                {
                    processing=false;
                    if(err)
                        console.log(err);
                });
                
            });
        });
    },
    get:function(id, callback)
    {
        var indexers=10;
        var sources=$.settings('source:'+id) || [];
        var result=[];
        processing='processing folders';
        var extension=extensions[id];
        $.db.scard('media:'+id+':toIndex', function(err, count){
            if(count==0)
                $.db.get('media:'+id+':lastIndex', function(err, lastIndex){
                    if(err)
                        console.log(err);
                    lastIndex=new Date(lastIndex);
                    $.eachAsync(sources, function(index,source,next)
                    {
                        processFolder(source, extension, lastIndex, function(media){
                            result=result.concat(media);
                            next();
                        });
                    }, function(){ 
                        debug('found '+result.length+' new '+id+'(s)');
                        
                        if(result.length===0)
                        {
                            indexer(id, scrappers[id], callback);
                            return processing=false;
                        }
                        processing='processing indexation';
                        result.unshift('media:'+id+':toIndex');
                        $.db.sadd(result, function(err){
                            if(err)
                                console.log(err);
                            for(var i=0;i<indexers;i++)
                            {
                                indexer(id, scrappers[id], callback);
                            }
                        });
                    });
                });
            else
            {
                processing='processing indexation';
                for(var i=0;i<Math.max(indexers, count);i++)
                {
                    indexer(id, scrappers[id], callback);
                }
            }
        });
    },
    check:function(id, callback)
    {
        var indexers=10;
        var sources=$.settings('source:'+id) || [];
        var result=[];
        processing='processing folders';
        var extension=extensions[id];
        $.db.scard('media:'+id+':toIndex', function(err, count){
            if(count==0)
            {
                lastIndex=new Date(1,0,1);
                $.db.sort('media:'+id, 'BY', 'nosort', 'GET', '*->path', function(err, paths){
                    var result=[];
                    $.eachAsync(paths, function(index,path,next)
                    {
                        $('fs').exists(translatePath(path.substring('file:///'.length)), function(exists)
                        {
                            if(!exists)
                                result.push(path);
                        });
                    }, function(){ 
                        debug('found '+result.length+' incorrect '+id+' path(s)');
                        
                        if(result.length===0)
                        {
                            indexer(id, scrappers[id], callback);
                            return processing=false;
                        }
                        processing='processing indexation';
                        result.unshift('media:'+id+':toIndex');
                        $.db.sadd(result, function(err){
                            if(err)
                                console.log(err);
                            for(var i=0;i<indexers;i++)
                            {
                                indexer(id, scrappers[id], callback);
                            }
                        });
                    });
                });
            }
            else
            {
                processing='processing indexation';
                for(var i=0;i<indexers;i++)
                {
                    indexer(id, scrappers[id], callback);
                }
            }
        });
    },
    reset:function(id, callback){
        $.db.keys('media:'+id+':*', function(err, keys){
            $.db.keys('tokens:'+id+':*', function(err, tokens){
                $.db.keys('index:'+id+'*', function(err, indexes){
                    keys=keys.concat(tokens).concat(indexes);
                    console.log('removing '+keys.length+' keys');
                    $.db.del(keys, function(err)
                    {
                        console.log(err);
                        callback(err || 'ok');
                    });                
                });
            })
        });
    }
};
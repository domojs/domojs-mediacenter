var debug=function(){};
var id3=require('musicmetadata');
var md5=require('md5');

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
            if(file=='$RECYCLE.BIN')
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
    // keep only files
    fileName=fileName.replace(/^([^\/]+\/)+([^\/]+)$/g, '$2');
    //trimming extension
    fileName=fileName.replace(extension, '');
    //trimming endTags
    fileName=fileName.replace(/(\[[A-F0-9]+\])*$/i, '');
    //trimming codecs and format
    fileName=fileName.replace(/(^(\[[^\]]+\]_?)(\[[^\]]{2,7}\])?)|((1080|720)[pi])|[0-9]{3,4}x[0-9]{3,4}|([XH]\.?)264|xvid|ogg|mp3|ac3|\+?aac|rv(9|10)e?([_-]EHQ)?|vost(f(r)?)?|real|(sub)?(st)?fr(ench)?|dvd(rip(p)?(ed)?)?|bluray|web-dl|V?[HLS][QD]|fin(al)?|TV|B[RD](rip(p)?(ed)?)?|v[1-9]|oav/gi, '');
    //checksum
    fileName=fileName.replace(/(\[[A-F0-9]+\]|\(_CRC[A-F0-9]+\))$/i, '');
    //other checksum format
    fileName=fileName.replace(/\[[a-f0-9]{6,8}\]/i, '');
    //team specification at the end of the file name
    fileName=fileName.replace(/(-[A-Z]+)$/i, '');
    //normalizing separators to a dot
    fileName=fileName.replace(/[-\._ ]+/g, '.');
    //trimming end tags
    fileName=fileName.replace(/\[[^\]]+\]\.?$/, '');
    //removing empty tags
    fileName=fileName.replace(/\[[\.+]?\]/g, '');
    //removing dates
    fileName=fileName.replace(/\[[0-9]{2}\.[0-9]{2}\.[0-9]{4}\]/, '');
    fileName=fileName.replace(/[0-9]{4}/, '');
    //trimming start for dots and spaces
    fileName=fileName.replace(/^[ \.]/g, '');
    //trimming end for dots
    fileName=fileName.replace(/[\. ]+$/, '');
    return fileName;
}

function videoScrapper(mediaType, media, callback)
{
    var episodeNumber = /(?:E(?:p(?:isode)?)?|Part)([0-9]+)/i;
    var seasonNumber = /(?:S(?:aison)?)([0-9]+)/i;
    var name = /(([A-Z!][A-Z!0-9]*|[A-Z!0-9]*[A-Z!])+(\.|$))+/i;
    var season = seasonNumber.exec(media.name);
    var episode = episodeNumber.exec(media.name);
    if(!episode || !episode[1])
    {
        if(!season)
        {
            episode=/([0-9]+)x([0-9]+)/.exec(media.name);
            if(episode && episode[2])
            {
                season=episode;
                episode={'1':episode[2],index:episode.index};
            }
            else
                episode=/(?:[^0-9]|^)([0-9]{1,3})(?:[^0-9]|$)/.exec(media.name);
        }
        else
            episode=/(?:[^0-9]|^)([0-9]{1,3})(?:[^0-9]|$)/.exec(media.name);
        
    }
    var maxLength=Math.min(season && season.index || media.name.length,episode && episode.index || media.name.length);
        if(episode!==null && episode && episode[1])
            episode=episode[1];
    var itemName=name.exec(media.name);
    if(itemName.index+itemName[0].length>maxLength)
        itemName=itemName[0].substr(0,maxLength);
    else
        itemName=itemName[0];
    itemName=itemName.replace(/\./g, ' ').replace(/ $/, '');
    var itemId=('media:'+mediaType+':'+itemName.replace(/ /g, '_')+(season && ':'+pad(season[1],2) || '')+(episode && ':'+pad(episode,3) || '')).toLowerCase();
    var args={mediaType:mediaType, path:media.path, name:itemName, displayName:itemName};
    if(season)
    {
        args.season=Number(season[1]);
        args.displayName=args.displayName+' - S'+Number(season[1]);
    }
    if(episode)
    {
        args.episode=Number(episode);
        args.displayName=args.displayName+' - E'+Number(episode);
    }
    
    callback({args:args, id:itemId, tokens:args.displayName.split(' ').concat(media.path.split(/[ \/]/g))});
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

function musicScrapper(mediaType, media, callback)
{
    try{
        var path=translatePath(media.path);
        var file=$('fs').createReadStream(path);
        file.on('error', function(err){
            console.log(err);
            $.db.sadd('media:'+mediaType+':failedToIndex', path, function(){
                console.log('added '+path+' to failed to index list');
                callback();
            });
        });
        id3(file).on('metadata', function(tags){
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
                console.log(err);
                $.db.sadd('media:'+mediaType+':failedToIndex', media.path, function(){
                    console.log('added '+media.path+' to failed to index list');
                    callback();
                });
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

function indexer(mediaType, scrapper, callback)
{
    $.db.spop('media:'+mediaType+':toIndex', function(err, path)
    {
        if(err)
            console.log(err);
        if(!path)
            return processing=false;
        var item={name:fileNameCleaner(path), path:path};
        scrapper(mediaType, item, function(result){
            if(result){
                var args=[result.id];
                result.args.path='file:///'+result.args.path;
                $.each(Object.keys(result.args), function(index, key){
                    args.push(key);
                    args.push(result.args[key]);
                });
                args.push('added');
                args.push(new Date().toISOString());
                var multi=$.db.multi()
                    .hmset(args)
                    .set(result.args.path, result.id)
                    .sadd('media:'+mediaType, result.id);
                if(result.indexes)
                    for(var index in result.indexes)
                        multi.sadd(result.indexes[index], result.id);
                $.each(result.tokens, function(index, token)
                {
                    if(token!='-')
                        multi.sadd('tokens:'+mediaType+':'+token.replace(/ /g, '_').toLowerCase(), result.id);
                });
                multi.exec(function(err, replies)
                {
                    if(err)
                        console.log(err);
                    process.nextTick(function(){
                        indexer(mediaType, scrapper, callback);
                    });
                });
                debug(result.id);
            }
            else
                process.nextTick(function(){
                    indexer(mediaType, scrapper, callback);
                });

        });
    });
    
    $.db.set('media:'+mediaType+':lastIndex', new Date().toISOString(), function(err){
        if(err)
            console.log(err);
    });
    callback(200);
}

var extensions={video:/\.(avi|mkv|flv|mp4|mpg)$/i, music: /\.(mp3|fla|flac|m4a)$/i};
var scrappers={video:videoScrapper, music:musicScrapper};

module.exports={
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
                            console.log(arguments);
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
                            console.log(arguments);
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
                keys=keys.concat(tokens);
                console.log('removing '+keys.length+' keys');
                $.db.del(keys, function(err)
                {
                    console.log(err);
                    callback(err || 'ok');
                });
            })
        });
    }
};
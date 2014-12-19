var debug=$('debug')('media');

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

module.exports={
    item:function(id, callback){
        $.db.hgetall(id, function(error, result){
            if(error)
                console.log(error);
            callback(result);
        });
    },
    get:function(id, viewName, draw, length, start, search, callback)
    {
        if(typeof(search)=='undefined')
            search=this.request.query['search[value]'].toLowerCase();

		var self=this;
        if(search)
        {
            $.db.del('media:search', function(error, result){
                if(error)
                {
                    console.log(error);
                }
                var args=['media:search', 'media:'+id];
                
                $.each(search.split(' '), function(index, token)
                {
                    args.push('tokens:'+id+':'+token);
                });
                console.log('sinterstore '+args.join(' '));
                $.db.sinterstore(args, function(error, results){
                    if(error)
                        console.log(error);
                    module.exports.get.call(self, id, viewName, draw, length, start, false, callback);
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
                columns.push('episode');
                columns.push('season');
                columns.push('readcount');
                break;
		}
		if(search===false)
		{
            id='search';
		}
        console.log('library '+id+' LIMIT '+start+','+length);
		var args=['media:'+id, 'LIMIT', start, length];
		for(var i in columns)
		{
            args.push('GET');
            if(columns[i]=='id')
                args.push('#');
            else
                args.push('*->'+columns[i]);
		}
		args.push('ALPHA');
		$.db.scard('media:'+id, function(error, count){
            if(error)
            {
                console.log(error);
                return callback(500, error);
            }
            console.log(count+' found');
            $.db.sort(args, function(error, replies){
                var result=[];
                if(error)
                {
                    console.log(error);
                    return callback(500, error);
                }
                for(var i=0; i<replies.length;)
                {
                    var item={};
                    for(var c in columns)
                    {
                        item[columns[c]]=replies[i++];
                    }
                    result.push(item);
                }
                callback({
                    draw:draw,
                    recordsTotal:count,
                    recordsFiltered:count,
                    data:result
                    });
            });
        });
    },
    hasNext:function(id, callback)
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
            $.db.exists(nextId, function(error, exists){
                if(exists)
                    callback(nextId);
                else 
                {
                    fragments[index]--;
                    tryFind(--index);
                }
            });
        };
        tryFind(fragments.length-1);
    }
};
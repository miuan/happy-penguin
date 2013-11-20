var pg = null;

module.exports = {

    // init
    $init : function(server, Hapi){
        pg = server.pgClient;

    },
    // get Hapi Config
    $getConfig : function(){
        return {
            params : '{params*}'

        }
    },index_get : function(request){
        if(!request.params){
            request.reply.view('stats');
            return;
        }

        var params = request.params.params.split('/');



        if(params.length > 1 && params[0].length > 0 && params[1].length > 0){
            var sql = 'SELECT record, lang, word'
                //+ ' ,(SELECT count(*) FROM link linkadd where linkadd.usr=$1 and linkadd.lesson=link.lesson AND linkadd.image IS NOT NULL) AS images_add'
                //+ ' ,(SELECT count(*) FROM link linkdel where linkdel.usr=$1 and linkdel.lesson=link.lesson AND linkdel.image IS NULL) AS image_del'
                + ' FROM word JOIN link ON link.lid=word.link WHERE word.usr=$1';
            var sqlData = [params[0]]
            pg.query(sql, sqlData, function(err, data){
                console.log(err, sql, sqlData[0]);
                request.reply(err ? err : data.rows);
            });
        }
        else if(params.length > 0 && params[0].length > 0){

            var sql = 'SELECT lesson,count(*),max(word.uts),min(word.uts)'
                //+ ' ,(' + sql2 + ')'
                + ' ,(SELECT count(*) FROM link linkadd WHERE linkadd.usr=$1 and linkadd.lesson=link.lesson AND linkadd.image IS NOT NULL) AS images_add'
                + ' ,(SELECT count(*) FROM link linkdel WHERE linkdel.usr=$1 and linkdel.lesson=link.lesson AND linkdel.image IS NULL) AS image_del'
                + ' ,(SELECT count(*) FROM link linkconf WHERE linkconf.usr=$1 and linkconf.lesson=link.lesson '
                + ' AND ( linkconf.version != 0 OR (SELECT usr FROM link lch WHERE lch.lid=linkconf.lid AND lch.version != 0 AND lch.usr != $1 LIMIT 1) != 1 )) AS image_conf'
                + ' FROM word JOIN link ON link.lid=word.link WHERE word.usr=$1 group BY lesson ORDER BY lesson';
            var sqlData = [params[0]]
            pg.query(sql, sqlData, function(err, data){
                console.log(err, sql, sqlData[0]);
                var sql2 = ', (SELECT count(*) FROM link '
                            + ' JOIN word w1 ON link.lid=w1.link'
                            + ' JOIN word w2 ON link.lid=w2.link'
                            + ' WHERE w1.usr=$1 AND w2.usr > 1 AND w2.usr != w1.usr AND link.lesson ='
                var sql2tail = ') AS lesson_';
                var sql3 = '';
                if(!err && data.rows && data.rows.length > 0){
                    data.rows.forEach(function(row, idx){
                        sql3 += sql2 + row.lesson + sql2tail + row.lesson;
                    });
                    sql3 = 'SELECT ' + sql3.substring(2);
                    pg.query(sql3, sqlData, function(err, conflicts){
                        console.log(err, conflicts ,sql3);
                        if(!err){
                            data.rows.forEach(function(row, idx){
                                data.rows[idx].conflicts = conflicts.rows[0]['lesson_'+data.rows[idx].lesson];
                                //
                            });
                        }



                        request.reply(err ? err : data.rows);
                    });
                } else {
                    request.reply(err ? err : data.rows);
                }


            });
        }

    },get_get : function(request){





    }
}
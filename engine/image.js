/**
 * Created by milan on 10/21/13.
 */
var config = require('../config/local.js'),
    fs = require('fs')
    , im = require('imagemagick')
    , async = require('async')
    , link = require('./link.js');

var PUBLIC_DIR = config.DIR_DATA + ''

// https://github.com/bruce/node-temp/blob/master/lib/temp.js
var generateName = function(rawAffixes, defaultPrefix) {
    //var affixes = parseAffixes(rawAffixes, defaultPrefix);
    var now = new Date();
    var name = [
        now.getYear(), now.getMonth(), now.getDate(),
        '-',
        process.pid,
        '-',
        (Math.random() * 0x100000000 + 1).toString(36),
        ].join('');
    return name;
}

var generateNameInTemp = function(){
    return config.DIR_TMP + generateName();
}

module.exports.saveFromUrl = function(pgClient, userId, linkId, url, cb){
    var http = require('http');


    var tempName = generateNameInTemp()  +'.png';
    console.log(tempName);
    var file = fs.createWriteStream(tempName);

    var request = http.get(url, function(response) {

        response.on('end', function() {
            file.end();
            // Uncaught Error: spawn ENOENT
            // at errnoException (child_process.js:980:11)
            // at Process.ChildProcess._handle.onexit (child_process.js:771:34)
            console.log('end of pipe')

            async.waterfall([
                function(icb){
                    icb(null, tempName);
                },prepareImage
                , countMD5AndCopy
                , storeInDb
                , updateLink
            ]
                ,cb);

        });

        response.pipe(file);





    });


    function updateLink(imageId, icb){
        var linkConteiner = {
            image : imageId,
            lid : linkId};
        //console.log(linkConteiner);
        link.updateAndGet(pgClient,userId, linkConteiner, icb);
    }



    function storeInDb(imgFile, mdSum, icb){
        console.log(mdSum + '  ' + imgFile);

        // NO STORE because already exists image with this md5sum
        if(!icb){
            // imgFile - cointains id of IMAGE
            mdSum(null, imgFile);
            return;

            // SKIP INSERT - because already
        }


        var sql = 'INSERT INTO image (image, md5, usr) VALUES ($1,$2,$3) RETURNING iid';
        console.log(sql);
        console.log(imgFile);
        pgClient.query(sql,[imgFile, mdSum, userId], function(err, data){
            if(err){
                icb(err, null);
                return;
            }

            console.log(data);
            // RETURN new id of image
            icb(null, data.rows[0].iid);
        });

    }

    function isExistsSameImgWithMD5(md5, icb){
        var sql = 'SELECT iid FROM image where md5 = $1';
        console.log(sql);
        pgClient.query(sql,[md5], function(err, rows){

            if(err){
                icb(err, null);
                return;
            }

            console.log(rows);

            if(rows.rows.length < 1){
                icb(err, -1);
            } else {
                icb(err, rows.rows[0].iid);
            }

        });

    }

    function countMD5AndCopy(resizedFile, icb){
        var crypto = require('crypto');
        var md5sum = crypto.createHash('md5');

        var data = fs.readFile(resizedFile, function(err, data){
            md5sum.update(data);
            var sum = md5sum.digest('hex');

            isExistsSameImgWithMD5(sum, function(err, imageID){
                if(err){
                    icb(err, null);
                    return;
                }

                if(imageID > 0){
                    console.log(imageID);
                    // image with this md5 exists use his id
                    icb(false, imageID);

                    // dont copy the file
                    return;
                }

                // copy
                var writeFileName = generateName() +'.png';;
                var writeFile = PUBLIC_DIR +writeFileName
                fs.writeFile(writeFile, data, function(err){
                    // create new image in DB with file name and md5
                    icb(err, writeFileName, sum);
                });
            });


        });
    }

};





function prepareImage(fileName, cb){
    console.log('identyty')  ;
    function identify(icb){
        console.log('identyty3')  ;
        im.identify(fileName, function(err, metadata){

            if (err) throw err;
            console.log(metadata);
            icb(null, metadata);
        });
    }

    function crop(metadata, icb){
        /// make quadratic
        var width = metadata.width < metadata.height ? metadata.width : metadata.height;
        var height = metadata.width < metadata.height ? metadata.width : metadata.height;

        var newFile = metadata.artifacts.filename + '.crop';

        im.crop({
            srcPath: metadata.artifacts.filename,
            dstPath: newFile,
            width: width,
            height: height,
            quality: 1,
            gravity: "Center"
            , format: 'png'
        }, function(err){
            icb(null, newFile, metadata);
        });
    }

    function resize(newFile, metadata,icb){
        var resizedFile = newFile + 'resize.png';
        im.resize({
            srcPath: newFile,
            dstPath: resizedFile,
            width:   128
            ,height:   128
        }, function(err, stdout, stderr){
            if (err) throw err;
            im.identify(resizedFile, function(err, metadata){
                console.log(metadata);
                icb(null, resizedFile);
            });

        });
    }


    async.waterfall([
        identify
        , crop
        , resize
    ],cb);

      //cb() ;

}
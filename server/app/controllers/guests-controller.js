const { validationResult } = require('express-validator')
const Guest = require('../models/guests-model')
const Room = require('../models/rooms-model')
const Invoice = require('../models/invoices-model')
const Payment = require('../models/payments-model')
const { pick } = require('lodash')
const cloudinary = require('../middlewares/cloudinary')
const guestsCltr = {}

guestsCltr.create = async (req,res) => {
    const errors = validationResult(req)
    if(!errors.isEmpty()) {
        return res.status(400).json({errors: errors.array()})
    }
    const buildingId = req.params.buildingid
    const roomId = req.params.roomid
    const body = pick(req.body,['name','gender','dob','phone','email','address','aadharNo','qualification','guardian','guardianNo','ownerId'])
    try{
        //checking if the guest already exists
        const guest1 = await Guest.findOne({finderId: req.user.id,buildingId: buildingId})
        if(guest1) {
            return res.status(400).json({error: 'Guest already exists'})
        }
        const guest2 = new Guest(body)
        guest2.finderId = req.user.id
        guest2.buildingId = buildingId
        guest2.roomId = roomId
        guest2.aadharPic = req.files['aadharPic'] ? req.files['aadharPic'].map(file => file.path) : []        
        const pushid= guest2._id
        const room = await Room.findOne({_id:roomId,})
        if(room.guest.length<room.sharing){
            await Room.findOneAndUpdate(
                { _id: roomId },
                { $push: { guest: pushid } },
                { new: true } 
              );
            await guest2.save()
        }
        else{
            return res.status(400).json({error:'Room is not available'})
        }
        res.json(guest2)
    } catch(err) {
        console.log(err)
        res.status(500).json({error: 'Internal Server Error'})
    }
}

guestsCltr.list = async (req,res) => {
    try {
        const buildingId = req.params.buildingid
        const search = req.query.search || ''
        const sortBy = req.query.sortBy || 'roomId.amount'
        const amtorder = req.query.amtorder ||'desc'
        const order = req.query.order ||'desc'
        let page = req.query.page || 1
        let limit = req.query.limit ||10
        const stayParam = req.query.stay || true
        const stay = stayParam === 'false' ? false : Boolean(stayParam);
        const searchQuery = {stay:stay}
        const sortQuery ={}
        sortQuery[sortBy] = order === 'asc'? 1 : -1
        sortQuery['roomId.amount'] = order === 'asc' ? 1 : -1;
        page = parseInt(page)
        limit = parseInt(limit)
        const guests = await Guest.find({ buildingId: buildingId }).populate('roomId').populate('invoiceHistory').populate('paymentHistory')
        .find(searchQuery)

        if(!guests) {
            return res.status(404).json({message: 'Record Not Found'})
        }

        guests.sort((a, b) => {
            const amountA = a.roomId ? a.roomId.amount : 0;
            const amountB = b.roomId ? b.roomId.amount : 0;
            return amtorder === 'asc' ? amountA - amountB : amountB - amountA;
        });

        
        const filteredGuests = guests.filter(guest =>
            guest.name.toLowerCase().includes(search.toLowerCase())
        );


        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedGuests = filteredGuests.slice(startIndex, endIndex);

        const total = guests.length;
        
        res.json({
            data:paginatedGuests,
            page,
            total,
            limit,
            stay,
            totalPages:Math.ceil(total / limit)
        })
    } catch(err) {
        console.log(err) 
        res.status(500).json({error: 'Internal Server Error'})
    }
}

//list the pending guest registration of a finder
guestsCltr.listPendingReg = async (req,res) => {
    try {
        const userid = req.user.id
        const guests = await Guest.find({userId: userid, isComplete: false}).populate('buildingId', 'name');
        if(!guests) {
            return res.status(404).json({message: 'Record Not Found'})
        } 
        return res.json(guests)
    } catch(err) {
        console.log(err)
        res.status(500).json({error: 'Internal Server Error'})
    }
}

guestsCltr.update = async (req,res) => {
    const errors = validationResult(req)
    if(!errors.isEmpty()) {
        return res.status(400).json({errors: errors.array()})
    }
    const buildingId = req.params.buildingid
    const body = pick(req.body,['name','profile','gender','age','dob','phoneNo','address','aadharNo','qualification','guardian','guardianNo','isComplete'])

    const singleImageUpload = async (file, folderName) => {
        const result = await cloudinary.uploader.upload(file.path, { folder: folderName });
        return result.secure_url
    };

    const profile = await singleImageUpload(req.files.profile[0], 'GuestProfile'); 
    body.profile = profile

    const aadharPic = await singleImageUpload(req.files.aadharPic[0], 'Aadhar'); 
    body.aadharPic = aadharPic
    try {
        const guest = await Guest.findOneAndUpdate({userId:req.user.id,buildingId: buildingId},body,{new:true})
        if(!guest) {
            return res.status(404).json({message: 'Record Not Found'})
        }
        res.json(guest)
    } catch(err) {
        console.log(err)
        res.status(500).json({error: 'Internal Server Error'})
    }
}

guestsCltr.destroy = async (req,res) => {
    const id = req.params.id
    const buildingId = req.params.buildingid
    try{
        const body = pick(req.body,['stay'])
        const guest = await Guest.findOneAndUpdate({_id: id,buildingId: buildingId},body,{new:true})
        if(!guest) {
            return res.json({message: 'Record Not Found'})
        }
        const roomid=guest.roomId
        const room= await Room.findOne({_id:roomid,buildingId:buildingId})
        const guestarray = room.guest.filter((ele)=>{
            return ele != id
        })
        room.guest=guestarray
        await Room.findOneAndUpdate({_id:roomid,buildingId:buildingId},room)
        res.json(guest)
    } catch(err) {
        console.log(err)
        res.status(500).json({error: 'Internal Server Error'})
    }
}

guestsCltr.check = async(req,res)=>{
    try{
        const buildingId = req.params.buildingid
    const finderId = req.params.finderid
    const check = await Guest.findOne({buildingId:buildingId,finderId:finderId})
    res.json(check)
    } catch(err){
        console.log(err)
        res.status(500).json({error: 'Internal Server Error'})
    } 
}

guestsCltr.status = async(req,res)=>{
    try{
        const buildingId = req.params.buildingid
        const invoicesList = await Invoice.find({buildingId:buildingId}).select('_id')
        const status = await Payment.find({invoiceId: invoicesList.map((ele)=>ele._id)}).select('_id status amount updatedAt')
        const data = status.filter((ele)=>ele.status==="Successful")
        const revData = data.map((ele)=>{
            const month = new Date(ele.updatedAt).getMonth()
            return {month, amount: ele.amount}
        }).reduce((totalRevMonth, item)=>{
            totalRevMonth[item.month] = (totalRevMonth[item.month] || 0 ) + item.amount
            return totalRevMonth
        },{})
        const revenue = Object.entries(revData).map(([month, amount]) => ({ month: parseInt(month), amount }));
        res.json({
            "revenue": revenue,
            "status":status
        })
    } catch(err){
        console.log(err)
        res.status(500).json({error:'Internal Server Error'})
    }
}

module.exports = guestsCltr